<?php

namespace App\Http\Controllers;

use App\Http\Requests\Pages\StoreUploadRequest;
use App\Models\Page;
use App\Models\Upload;
use App\Models\Workspace;
use App\Support\ClientId;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Les fichiers des blocs Image, Vidéo, Audio et Fichier d'une page. Chaque fichier est rangé dans
 * son propre dossier au nom aléatoire (public/uploads/<espace>/<identifiant>/<nom sûr>) : son
 * adresse ne se devine pas, et le nom reste lisible au téléchargement.
 */
class UploadController extends Controller
{
    public function store(StoreUploadRequest $request, Page $page): JsonResponse
    {
        Gate::authorize('update', $page);

        // Le même fichier renvoyé après une coupure (ajouté hors ligne, spec 6.16) : celui déjà rangé.
        $existing = ClientId::existing(Upload::class, $request->input('id'), $page->workspace_id);
        if ($existing !== null) {
            return response()->json($existing->toApi());
        }

        $file = $request->file('file');

        $quotaMb = (int) config('nonotion.uploads.quota_mb');
        $used = (int) Upload::query()->where('workspace_id', $page->workspace_id)->sum('size');
        if ($used + $file->getSize() > $quotaMb * 1024 * 1024) {
            $limit = $quotaMb % 1024 === 0 ? ($quotaMb / 1024).' Go' : "{$quotaMb} Mo";
            throw ValidationException::withMessages(['file' => "Cet espace de travail a atteint sa limite de {$limit} de fichiers."]);
        }

        $original = mb_substr(trim($file->getClientOriginalName()) ?: 'fichier', 0, 255);
        // L'identifiant du fichier est aussi le nom de son dossier.
        $id = strtolower($request->input('id') ?: (string) Str::ulid());
        $path = $file->storeAs("{$page->workspace_id}/{$id}", Upload::safeName($original), 'uploads');

        $upload = (new Upload)->forceFill([
            'id' => $id,
            'workspace_id' => $page->workspace_id,
            'page_id' => $page->id,
            'user_id' => $request->user()?->id,
            'name' => $original,
            'path' => $path,
            'mime' => mb_substr($file->getMimeType() ?: 'application/octet-stream', 0, 127),
            'size' => $file->getSize(),
        ]);
        $upload->save();

        return response()->json($upload->toApi(), 201);
    }

    /**
     * Le contenu d'un fichier, pour l'application qui en garde une copie sur l'appareil (spec 6.16) :
     * par l'API, donc avec ses règles d'origine (CORS), là où public/uploads n'en a pas. Seulement
     * pour qui voit l'espace de travail du fichier ; jamais affiché comme une page.
     */
    public function show(string $path): BinaryFileResponse
    {
        $upload = Upload::query()->withoutGlobalScopes()->where('path', $path)->first();
        $workspace = $upload ? Workspace::query()->find($upload->workspace_id) : null;
        abort_if($upload === null || $workspace === null || Gate::denies('view', $workspace), 404);
        abort_unless(Storage::disk('uploads')->exists($upload->path), 404);

        return response()->file(Storage::disk('uploads')->path($upload->path), [
            'Content-Type' => $upload->mime,
            'Content-Disposition' => 'attachment',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }
}
