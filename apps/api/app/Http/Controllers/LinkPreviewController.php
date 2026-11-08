<?php

namespace App\Http\Controllers;

use App\Support\Calendars\FetchFailed;
use App\Support\Links\LinkPreview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

/**
 * POST /link-preview : l'aperçu d'un lien web pour le bloc « Aperçu de lien ». Gardé un jour : la
 * même adresse collée dans plusieurs pages n'est lue qu'une fois.
 */
class LinkPreviewController extends Controller
{
    public function __invoke(Request $request, LinkPreview $previews): JsonResponse
    {
        $request->validate(['url' => ['required', 'string', 'max:2048']]);

        try {
            $url = LinkPreview::normalize($request->string('url')->toString());
            $preview = Cache::remember(
                'link-preview:'.sha1($url),
                now()->addHours(config('nonotion.link_preview.cache_hours')),
                fn () => $previews->for($url),
            );
        } catch (FetchFailed $e) {
            throw ValidationException::withMessages(['url' => $e->getMessage()]);
        }

        return response()->json(['data' => $preview]);
    }
}
