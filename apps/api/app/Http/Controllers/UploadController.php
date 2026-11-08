<?php

namespace App\Http\Controllers;

use App\Http\Requests\Pages\StoreUploadRequest;
use App\Models\Page;
use App\Models\Upload;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

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

        $file = $request->file('file');
        $original = mb_substr(trim($file->getClientOriginalName()) ?: 'fichier', 0, 255);
        $id = (string) Str::ulid();
        $path = $file->storeAs("{$page->workspace_id}/".strtolower($id), Upload::safeName($original), 'uploads');

        $upload = Upload::create([
            'workspace_id' => $page->workspace_id,
            'page_id' => $page->id,
            'user_id' => $request->user()?->id,
            'name' => $original,
            'path' => $path,
            'mime' => mb_substr($file->getMimeType() ?: 'application/octet-stream', 0, 127),
            'size' => $file->getSize(),
        ]);

        return response()->json($upload->toApi(), 201);
    }
}
