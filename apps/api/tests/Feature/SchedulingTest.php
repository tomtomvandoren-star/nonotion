<?php

use App\Models\Booking;
use App\Models\Page;
use App\Models\SchedulingLink;
use App\Models\Workspace;
use App\Support\Scheduling\BookingMail;
use App\Support\Scheduling\Intervals;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

/*
 * Planifier (spec 6.17) : liens de planification, créneaux, réservations publiques, replanification
 * et annulation, disponibilités partagées. Lundi 16 novembre 2026, 8 h UTC (9 h à Bruxelles).
 */

beforeEach(function () {
    Carbon::setTestNow('2026-11-16 08:00:00');
    Mail::fake();
});

/** Un Gestionnaire de tâches (sa Date « Échéance » reçoit les rendez-vous) ; renvoie la base. */
function planningBase(Workspace $workspace): array
{
    $page = test()->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Agenda'])->json('data.id');

    return test()->postJson("/api/workspaces/{$workspace->id}/databases", ['page_id' => $page, 'template' => 'tasks'])->json('data');
}

function planningDate(array $database): string
{
    return collect($database['schema'])->firstWhere('type', 'date')['id'];
}

/** Un lien récurrent : lundi 9 h-12 h et 14 h-17 h à Bruxelles, 30 min, sans délai. */
function planningLink(Workspace $workspace, array $database, array $overrides = []): array
{
    return test()->postJson("/api/workspaces/{$workspace->id}/scheduling-links", [
        'type' => 'recurring',
        'title' => 'Entretien',
        'timezone' => 'Europe/Brussels',
        'duration_minutes' => 30,
        'slot_step_minutes' => 30,
        'target_database_id' => $database['id'],
        'availability' => [
            ['weekday' => 1, 'start' => '09:00', 'end' => '12:00'],
            ['weekday' => 1, 'start' => '14:00', 'end' => '17:00'],
        ],
        ...$overrides,
    ])->assertCreated()->json('data');
}

function planningSlots(string $slug, string $from = '2026-11-16T00:00:00Z', string $to = '2026-11-17T00:00:00Z'): array
{
    return test()->getJson("/api/public/scheduling/{$slug}/slots?".http_build_query(['from' => $from, 'to' => $to]))
        ->assertOk()->json('data.slots');
}

function planningBook(string $slug, string $start, array $extra = [])
{
    return test()->postJson("/api/public/scheduling/{$slug}/bookings", [
        'start' => $start,
        'name' => 'Marie Dupont',
        'email' => 'marie@example.test',
        'timezone' => 'America/Montreal',
        ...$extra,
    ]);
}

it('soustrait, fusionne et contient des intervalles', function () {
    expect(Intervals::merge([[5, 8], [1, 3], [2, 4], [8, 9]]))->toBe([[1, 4], [5, 9]])
        ->and(Intervals::subtract([[0, 10]], [[2, 3], [5, 7]]))->toBe([[0, 2], [3, 5], [7, 10]])
        ->and(Intervals::subtract([[0, 10]], [[0, 10]]))->toBe([])
        ->and(Intervals::contains([[0, 2], [3, 5]], 3, 5))->toBeTrue()
        ->and(Intervals::contains([[0, 2], [3, 5]], 1, 4))->toBeFalse();
});

it('un lien récurrent propose ses créneaux du lundi, à l’heure de Bruxelles, après le délai de prévenance', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace), ['min_notice_minutes' => 60]);

    $slots = planningSlots($link['slug']);
    // 9 h-12 h et 14 h-17 h à Bruxelles (UTC+1 en novembre) ; il est 9 h : rien avant 10 h.
    expect($slots[0])->toBe('2026-11-16T09:00:00Z')
        ->and($slots)->toContain('2026-11-16T10:30:00Z')
        ->and($slots)->not->toContain('2026-11-16T11:00:00Z')
        ->and($slots)->toContain('2026-11-16T13:00:00Z')
        ->and(end($slots))->toBe('2026-11-16T15:30:00Z')
        ->and($slots)->toHaveCount(4 + 6);
});

it('« lundi 9 h » reste 9 h à Bruxelles de part et d’autre du changement d’heure', function () {
    Carbon::setTestNow('2027-03-20 08:00:00');
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace));

    // Lundi 22 mars (heure d'hiver, UTC+1) puis lundi 29 mars (heure d'été, UTC+2).
    expect(planningSlots($link['slug'], '2027-03-22T00:00:00Z', '2027-03-23T00:00:00Z')[0])->toBe('2027-03-22T08:00:00Z')
        ->and(planningSlots($link['slug'], '2027-03-29T00:00:00Z', '2027-03-30T00:00:00Z')[0])->toBe('2027-03-29T07:00:00Z');
});

it('un lien ponctuel ne propose que ses plages datées, dans la fenêtre de réservation et avant expiration', function () {
    $workspace = signIn();
    $link = test()->postJson("/api/workspaces/{$workspace->id}/scheduling-links", [
        'type' => 'one_off',
        'title' => 'Café',
        'timezone' => 'Europe/Brussels',
        'duration_minutes' => 60,
        'slot_step_minutes' => 60,
        'max_advance_days' => 5,
        'availability' => [
            ['start' => '2026-11-17T09:00:00Z', 'end' => '2026-11-17T11:00:00Z'],
            ['start' => '2026-11-18T13:00:00Z', 'end' => '2026-11-18T14:00:00Z'],
            ['start' => '2026-11-30T09:00:00Z', 'end' => '2026-11-30T10:00:00Z'],
        ],
    ])->assertCreated()->json('data');

    $slots = planningSlots($link['slug'], '2026-11-16T00:00:00Z', '2026-12-05T00:00:00Z');
    // Le 30 novembre est au-delà des 5 jours.
    expect($slots)->toBe(['2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', '2026-11-18T13:00:00Z']);

    $this->patchJson("/api/scheduling-links/{$link['id']}", ['expires_at' => '2026-11-18T00:00:00Z'])->assertOk();
    expect(planningSlots($link['slug'], '2026-11-16T00:00:00Z', '2026-12-05T00:00:00Z'))->toHaveCount(2);
});

it('un invité sans compte réserve : le rendez-vous est dans l’agenda, chacun reçoit son e-mail, le créneau disparaît', function () {
    $workspace = signIn();
    $database = planningBase($workspace);
    $link = planningLink($workspace, $database);
    app('auth')->forgetGuards();

    $response = planningBook($link['slug'], '2026-11-16T13:00:00Z', ['note' => 'À propos du stage'])->assertCreated();
    expect($response->json('data.manage_url'))->toStartWith(config('nonotion.frontend_url').'/rdv/gerer/')
        ->and($response->json('data.start_at'))->toBe('2026-11-16T13:00:00Z');

    $booking = Booking::query()->withoutGlobalScopes()->sole();
    $row = Page::query()->withoutGlobalScopes()->find($booking->page_id);
    expect($row->database_id)->toBe($database['id'])
        ->and($row->title)->toBe('Entretien · Marie Dupont')
        ->and($row->properties[planningDate($database)])->toMatchArray(['start' => '2026-11-16T13:00:00Z', 'end' => '2026-11-16T13:30:00Z'])
        ->and($row->search_text)->toContain('À propos du stage');
    Mail::assertSent(BookingMail::class, fn (BookingMail $mail) => $mail->hasTo('marie@example.test') && $mail->recipient === 'invitee');
    Mail::assertSent(BookingMail::class, fn (BookingMail $mail) => $mail->recipient === 'organizer');

    expect(planningSlots($link['slug']))->not->toContain('2026-11-16T13:00:00Z');
});

it('deux invités ne réservent jamais le même créneau', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace));

    planningBook($link['slug'], '2026-11-16T13:00:00Z')->assertCreated();
    planningBook($link['slug'], '2026-11-16T13:00:00Z', ['email' => 'paul@example.test'])
        ->assertStatus(409)
        ->assertJsonPath('message', 'Ce créneau n’est plus disponible. Choisissez-en un autre.');
    // Un horaire qui n'est pas un créneau proposé n'est pas réservable non plus.
    planningBook($link['slug'], '2026-11-16T13:10:00Z')->assertStatus(409);
    expect(Booking::query()->withoutGlobalScopes()->count())->toBe(1);
});

it('« éviter les conflits » : un élément ajouté à l’Agenda retire les créneaux correspondants', function () {
    $workspace = signIn();
    $database = planningBase($workspace);
    $link = planningLink($workspace, $database);

    $this->postJson("/api/databases/{$database['id']}/rows", [
        'title' => 'Dentiste',
        'properties' => [planningDate($database) => ['start' => '2026-11-16T14:00:00Z', 'end' => '2026-11-16T15:00:00Z']],
    ])->assertCreated();
    // Une journée entière n'occupe pas.
    $this->postJson("/api/databases/{$database['id']}/rows", [
        'title' => 'Anniversaire',
        'properties' => [planningDate($database) => ['start' => '2026-11-16']],
    ])->assertCreated();

    $slots = planningSlots($link['slug']);
    expect($slots)->not->toContain('2026-11-16T14:00:00Z')->not->toContain('2026-11-16T14:30:00Z')
        ->and($slots)->toContain('2026-11-16T13:30:00Z')->toContain('2026-11-16T15:00:00Z')
        ->and($slots)->toContain('2026-11-16T09:00:00Z');

    $this->patchJson("/api/scheduling-links/{$link['id']}", ['avoid_conflicts' => false])->assertOk();
    expect(planningSlots($link['slug']))->toContain('2026-11-16T14:00:00Z');
});

it('les marges laissent de la place autour d’un rendez-vous', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace), ['slot_step_minutes' => 15, 'buffer_before_minutes' => 15]);

    // Un rendez-vous de 14 h à 14 h 30 (UTC), puis 15 min de marge avant le suivant.
    planningBook($link['slug'], '2026-11-16T14:00:00Z')->assertCreated();

    $slots = planningSlots($link['slug']);
    expect($slots)->not->toContain('2026-11-16T14:30:00Z')
        ->and($slots)->toContain('2026-11-16T14:45:00Z')
        ->and($slots)->toContain('2026-11-16T13:30:00Z')
        ->and($slots)->not->toContain('2026-11-16T13:45:00Z');
});

it('un lien à usage unique ne sert qu’une fois, et ne se replanifie pas', function () {
    $workspace = signIn();
    $link = test()->postJson("/api/workspaces/{$workspace->id}/scheduling-links", [
        'type' => 'one_off',
        'title' => 'Visite',
        'timezone' => 'Europe/Brussels',
        'single_use' => true,
        'availability' => [['start' => '2026-11-17T09:00:00Z', 'end' => '2026-11-17T11:00:00Z']],
    ])->json('data');

    $token = planningBook($link['slug'], '2026-11-17T09:00:00Z')->assertCreated()->json('data.token');

    expect(planningSlots($link['slug'], '2026-11-16T00:00:00Z', '2026-11-20T00:00:00Z'))->toBe([]);
    $this->getJson("/api/public/scheduling/{$link['slug']}")
        ->assertJsonPath('data.unavailable_reason', 'Ce lien a déjà servi : il n’était valable que pour un rendez-vous.');
    $this->getJson("/api/public/bookings/{$token}")
        ->assertJsonPath('data.can_reschedule', false)
        ->assertJsonPath('data.can_cancel', true);
    $this->postJson("/api/public/bookings/{$token}/reschedule", ['start' => '2026-11-17T10:00:00Z'])->assertUnprocessable();
});

it('« une réservation au plus » : plus de créneau après la première, mais elle se replanifie', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace), ['allow_multiple_bookings' => false]);

    $token = planningBook($link['slug'], '2026-11-16T13:00:00Z')->assertCreated()->json('data.token');
    expect(planningSlots($link['slug']))->toBe([]);
    expect($this->getJson("/api/public/bookings/{$token}/slots?from=2026-11-16T00:00:00Z&to=2026-11-17T00:00:00Z")->json('data.slots'))
        ->toContain('2026-11-16T13:30:00Z');
});

it('replanifier puis annuler (avec motif) : chaque usage renouvelle le lien, l’agenda suit', function () {
    $workspace = signIn();
    $database = planningBase($workspace);
    $link = planningLink($workspace, $database);
    $first = planningBook($link['slug'], '2026-11-16T13:00:00Z')->json('data.token');
    $booking = Booking::query()->withoutGlobalScopes()->sole();

    $second = $this->postJson("/api/public/bookings/{$first}/reschedule", ['start' => '2026-11-16T15:00:00Z'])
        ->assertOk()->assertJsonPath('data.start_at', '2026-11-16T15:00:00Z')->json('data.token');
    expect($second)->not->toBe($first);
    $this->getJson("/api/public/bookings/{$first}")->assertNotFound();
    $row = Page::query()->withoutGlobalScopes()->find($booking->page_id);
    expect($row->properties[planningDate($database)]['start'])->toBe('2026-11-16T15:00:00Z');
    Mail::assertSent(BookingMail::class, fn (BookingMail $mail) => $mail->kind === 'rescheduled');

    $third = $this->postJson("/api/public/bookings/{$second}/cancel", ['reason' => 'Empêchement'])
        ->assertOk()->assertJsonPath('data.status', 'cancelled')->json('data.token');
    expect($third)->not->toBe($second);
    $this->getJson("/api/public/bookings/{$second}")->assertNotFound();
    expect($booking->refresh()->cancel_reason)->toBe('Empêchement')
        ->and(Page::query()->withoutGlobalScopes()->find($booking->page_id)->deleted_at)->not->toBeNull();
    Mail::assertSent(BookingMail::class, fn (BookingMail $mail) => $mail->kind === 'cancelled' && $mail->recipient === 'organizer');
    // Le créneau est de nouveau libre.
    expect(planningSlots($link['slug']))->toContain('2026-11-16T15:00:00Z');
});

it('l’organisateur supprime l’élément de son agenda : le rendez-vous est annulé, l’invité prévenu', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace));
    planningBook($link['slug'], '2026-11-16T13:00:00Z')->assertCreated();
    $booking = Booking::query()->withoutGlobalScopes()->sole();

    $this->deleteJson("/api/pages/{$booking->page_id}")->assertOk();

    expect($booking->refresh()->status)->toBe('cancelled')
        ->and($booking->cancelled_by)->toBe('organizer');
    Mail::assertSent(BookingMail::class, fn (BookingMail $mail) => $mail->kind === 'cancelled' && $mail->recipient === 'invitee');
    Mail::assertNotSent(BookingMail::class, fn (BookingMail $mail) => $mail->kind === 'cancelled' && $mail->recipient === 'organizer');
});

it('l’invitation (.ics) garde son identifiant et monte de version à chaque changement', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace), ['location' => 'Bureau 12']);
    $token = planningBook($link['slug'], '2026-11-16T13:00:00Z')->json('data.token');

    // Les lignes longues d'un .ics sont repliées (RFC 5545) : on les déplie.
    $ics = str_replace("\r\n ", '', $this->get("/api/public/bookings/{$token}/ics")->assertOk()->getContent());
    $id = Booking::query()->withoutGlobalScopes()->sole()->id;
    expect($ics)->toContain("UID:booking-{$id}@nonotion")->toContain('SEQUENCE:0')
        ->toContain('DTSTART:20261116T130000Z')->toContain('LOCATION:Bureau 12')
        ->toContain('mailto:marie@example.test')
        ->toContain('Replanifier ou annuler cet événement : '.config('nonotion.frontend_url')."/rdv/gerer/{$token}");

    $next = $this->postJson("/api/public/bookings/{$token}/reschedule", ['start' => '2026-11-16T14:00:00Z'])->json('data.token');
    $updated = str_replace("\r\n ", '', $this->get("/api/public/bookings/{$next}/ics")->getContent());
    expect($updated)->toContain('SEQUENCE:1')->toContain("/rdv/gerer/{$next}")->not->toContain("/rdv/gerer/{$token}");
    // Dans l'e-mail de l'invité aussi, avec le lien du moment.
    Mail::assertSent(BookingMail::class, fn (BookingMail $mail) => $mail->recipient === 'invitee'
        && $mail->kind === 'rescheduled' && str_contains($mail->manageUrl ?? '', $next));
});

it('un lien désactivé, supprimé ou d’une adresse prise : rien ne se réserve, l’adresse reste unique', function () {
    $workspace = signIn();
    $database = planningBase($workspace);
    $link = planningLink($workspace, $database, ['slug' => 'entretien-thomas']);
    expect($link['url'])->toEndWith('/rdv/entretien-thomas');

    $this->postJson("/api/workspaces/{$workspace->id}/scheduling-links", [
        'type' => 'recurring', 'title' => 'Autre', 'timezone' => 'Europe/Brussels', 'availability' => [],
        'slug' => 'entretien-thomas',
    ])->assertUnprocessable()->assertJsonPath('errors.slug.0', 'Cette adresse est déjà prise.');

    $this->patchJson("/api/scheduling-links/{$link['id']}", ['status' => 'disabled'])->assertOk();
    $this->getJson('/api/public/scheduling/entretien-thomas')->assertJsonPath('data.unavailable_reason', 'Ce lien de planification est désactivé.');
    planningBook('entretien-thomas', '2026-11-16T13:00:00Z')->assertUnprocessable();

    $this->deleteJson("/api/scheduling-links/{$link['id']}")->assertOk();
    expect(planningSlots('entretien-thomas'))->toBe([]);
});

it('les liens d’un autre ne se voient ni ne se modifient', function () {
    $alice = signIn('Alice');
    $link = planningLink($alice, planningBase($alice));
    $bob = createAccount('Bob');
    Sanctum::actingAs($bob);

    $this->getJson("/api/workspaces/{$alice->id}/scheduling-links")->assertNotFound();
    $this->patchJson("/api/scheduling-links/{$link['id']}", ['title' => 'Piraté'])->assertNotFound();
    $this->getJson("/api/scheduling-links/{$link['id']}/bookings")->assertNotFound();
    expect(SchedulingLink::query()->withoutGlobalScopes()->find($link['id'])->title)->toBe('Entretien');
});

it('les disponibilités d’une personne : seulement si elle me l’a permis, et seulement « occupé »', function () {
    $alice = createAccount('Alice');
    $bob = createAccount('Bob');
    $carol = createAccount('Carol');

    Sanctum::actingAs($alice);
    $database = planningBase(workspaceOf($alice));
    $this->postJson("/api/databases/{$database['id']}/rows", [
        'title' => 'Rendez-vous secret chez le médecin',
        'properties' => [planningDate($database) => ['start' => '2026-11-16T14:00:00Z', 'end' => '2026-11-16T15:00:00Z']],
    ])->assertCreated();
    $this->postJson('/api/freebusy-shares', ['email' => strtoupper($bob->email)])->assertCreated();
    $this->postJson('/api/freebusy-shares', ['email' => $alice->email])->assertUnprocessable();

    Sanctum::actingAs($bob);
    $this->getJson('/api/people?q=ali')->assertOk()->assertJsonPath('data.0.id', $alice->id)->assertJsonCount(1, 'data');
    $busy = $this->getJson("/api/people/{$alice->id}/freebusy?from=2026-11-16T00:00:00Z&to=2026-11-17T00:00:00Z")->assertOk();
    expect($busy->json('data'))->toBe([['start' => '2026-11-16T14:00:00Z', 'end' => '2026-11-16T15:00:00Z']])
        ->and($busy->getContent())->not->toContain('médecin');

    // Carol n'a rien reçu : elle ne trouve personne, et ne lit rien.
    Sanctum::actingAs($carol);
    $this->getJson('/api/people?q=a')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson("/api/people/{$alice->id}/freebusy?from=2026-11-16T00:00:00Z&to=2026-11-17T00:00:00Z")->assertNotFound();
});

it('les pages publiques limitent le débit, sans que lire les créneaux épuise le droit de réserver', function () {
    $workspace = signIn();
    $link = planningLink($workspace, planningBase($workspace));
    app()->detectEnvironment(fn () => 'production');

    foreach (range(1, 20) as $ignored) {
        planningSlots($link['slug']);
    }
    $slots = planningSlots($link['slug']);
    foreach (array_slice($slots, 0, 10) as $i => $slot) {
        planningBook($link['slug'], $slot, ['email' => "invite{$i}@example.test"])->assertCreated();
    }
    planningBook($link['slug'], $slots[10], ['email' => 'encore@example.test'])->assertStatus(429);
});
