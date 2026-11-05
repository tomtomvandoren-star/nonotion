<?php

namespace App\Http\Controllers;

use App\Models\Database;
use App\Models\Page;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Recherche (spec 6.12) : plein texte MariaDB (index FULLTEXT sur le titre et le texte des pages),
 * complétée par les titres qui contiennent la saisie. Les lignes de bases sont des pages : elles
 * sont trouvées aussi, avec le nom de leur base. Chaque résultat a un extrait autour du mot trouvé.
 */
class SearchController extends Controller
{
    private const LIMIT = 20;

    /** Longueur minimale d'un mot dans l'index FULLTEXT (innodb_ft_min_token_size). */
    private const MIN_TOKEN = 3;

    public function __invoke(Request $request, Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);
        $request->validate(['q' => ['required', 'string', 'max:200']]);

        $query = trim($request->string('q'));
        $terms = self::terms($query);
        if ($terms === []) {
            return response()->json(['data' => []]);
        }
        $like = '%'.addcslashes($query, '%_\\').'%';
        $words = array_values(array_filter($terms, fn (string $term) => mb_strlen($term) >= self::MIN_TOKEN));

        $builder = Page::query()
            ->where('workspace_id', $workspace->id)
            ->select(['id', 'title', 'icon', 'parent_page_id', 'database_id', 'search_text', 'updated_at']);

        if ($words !== []) {
            // Chaque mot doit être présent, en début de mot (« proj* » trouve « projet »).
            $against = implode(' ', array_map(fn (string $word) => '+'.$word.'*', $words));
            $builder
                ->where(fn ($where) => $where
                    ->whereRaw('MATCH(title, search_text) AGAINST (? IN BOOLEAN MODE)', [$against])
                    ->orWhere('title', 'like', $like))
                ->selectRaw('MATCH(title, search_text) AGAINST (? IN BOOLEAN MODE) AS score', [$against]);
        } else {
            // Des mots trop courts pour l'index : on cherche dans les titres seulement.
            $builder->where('title', 'like', $like)->selectRaw('0 AS score');
        }

        $pages = $builder
            // Un titre qui commence par la saisie, puis qui la contient, puis la pertinence.
            ->orderByRaw('title LIKE ? DESC', [addcslashes($query, '%_\\').'%'])
            ->orderByRaw('title LIKE ? DESC', [$like])
            ->orderByDesc('score')
            ->orderByDesc('updated_at')
            ->limit(self::LIMIT)
            ->get();

        $parents = Page::query()->whereIn('id', $pages->pluck('parent_page_id')->filter()->unique())->pluck('title', 'id');
        $databases = Database::query()->whereIn('id', $pages->pluck('database_id')->filter()->unique())->pluck('title', 'id');

        return response()->json(['data' => $pages->map(fn (Page $page) => [
            'id' => $page->id,
            'title' => $page->title,
            'icon' => $page->icon,
            'database_id' => $page->database_id,
            // Où se trouve la page : sa base pour une ligne, sinon sa page parente.
            'context' => $page->database_id !== null
                ? ($databases[$page->database_id] ?? null)
                : ($page->parent_page_id !== null ? ($parents[$page->parent_page_id] ?? null) : null),
            'excerpt' => self::excerpt((string) $page->search_text, $terms),
            'updated_at' => $page->updated_at?->toIso8601String(),
        ])->values()]);
    }

    /**
     * Les mots de la recherche, en minuscules, sans doublon (lettres et chiffres seulement : les
     * opérateurs du mode booléen de MariaDB n'y passent pas).
     *
     * @return list<string>
     */
    private static function terms(string $query): array
    {
        $words = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_slice(array_values(array_unique($words)), 0, 8);
    }

    /** Le texte sans accents ni majuscules, de la même longueur (un caractère pour un). */
    private static function fold(string $text): string
    {
        return implode('', array_map(function (string $char) {
            $decomposed = class_exists(\Normalizer::class) ? \Normalizer::normalize($char, \Normalizer::FORM_D) : $char;
            $base = mb_strtolower((string) preg_replace('/\p{Mn}/u', '', $decomposed ?: $char));

            return mb_strlen($base) === 1 ? $base : mb_strtolower($char);
        }, mb_str_split($text)));
    }

    /** Un extrait du texte autour du premier mot trouvé (environ 140 caractères). */
    private static function excerpt(string $text, array $terms): ?string
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
        if ($text === '') {
            return null;
        }
        // Sans accents ni majuscules, caractère par caractère : « pasteis » trouve « pastéis ».
        $folded = self::fold($text);
        $position = null;
        foreach ($terms as $term) {
            $found = mb_strpos($folded, self::fold($term));
            if ($found !== false && ($position === null || $found < $position)) {
                $position = $found;
            }
        }
        if ($position === null) {
            return null;
        }
        $start = max(0, $position - 50);
        $excerpt = mb_substr($text, $start, 140);

        return ($start > 0 ? '…' : '').trim($excerpt).($start + 140 < mb_strlen($text) ? '…' : '');
    }
}
