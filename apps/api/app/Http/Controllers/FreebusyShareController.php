<?php

namespace App\Http\Controllers;

use App\Models\FreebusyShare;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * « Qui peut voir mes disponibilités » (spec 6.17) : des adresses e-mail. On n'indique jamais si un
 * compte existe à cette adresse : la personne verra mes disponibilités dès qu'elle en aura un.
 */
class FreebusyShareController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $shares = FreebusyShare::query()->where('owner_id', $request->user()->id)->orderBy('viewer_email')->get();

        return response()->json(['data' => $shares->map(fn (FreebusyShare $share) => [
            'id' => $share->id,
            'email' => $share->viewer_email,
        ])->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:255']]);
        $email = mb_strtolower(trim($data['email']));
        $me = $request->user();
        if ($email === mb_strtolower($me->email)) {
            throw ValidationException::withMessages(['email' => 'C’est votre propre adresse.']);
        }
        if (FreebusyShare::query()->where('owner_id', $me->id)->count() >= 100) {
            throw ValidationException::withMessages(['email' => 'Au plus 100 personnes.']);
        }
        $share = FreebusyShare::query()->firstOrCreate(['owner_id' => $me->id, 'viewer_email' => $email]);

        return response()->json(['data' => ['id' => $share->id, 'email' => $share->viewer_email]], 201);
    }

    public function destroy(Request $request, FreebusyShare $share): JsonResponse
    {
        abort_unless($share->owner_id === $request->user()->id, 404);
        $share->delete();

        return response()->json(['status' => 'ok']);
    }
}
