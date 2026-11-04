<?php

namespace App\Support\Databases;

use App\Models\Database;
use App\Models\Page;
use App\Models\View;

/**
 * Copie des bases quand on duplique des pages : chaque base contenue dans une page copiée est
 * dupliquée (schéma, vues, lignes), et le bloc qui l'affiche dans la copie pointe vers la nouvelle.
 */
class PageCopier
{
    /** @param array<string, string> $pageCopies identifiant d'origine => identifiant de la copie */
    public static function copyDatabases(array $pageCopies): void
    {
        $databaseCopies = [];
        foreach (Database::query()->whereIn('page_id', array_keys($pageCopies))->get() as $database) {
            $copy = $database->replicate();
            $copy->page_id = $pageCopies[$database->page_id];
            $copy->save();
            $databaseCopies[$database->id] = $copy->id;

            foreach (View::query()->where('database_id', $database->id)->get() as $view) {
                $viewCopy = $view->replicate();
                $viewCopy->database_id = $copy->id;
                $viewCopy->save();
            }

            foreach (Page::query()->where('database_id', $database->id)->get() as $row) {
                $rowCopy = $row->replicate(['version']);
                $rowCopy->database_id = $copy->id;
                $rowCopy->parent_page_id = $pageCopies[$row->parent_page_id] ?? $copy->page_id;
                $rowCopy->is_favorite = false;
                $rowCopy->save();
            }
        }

        if ($databaseCopies === []) {
            return;
        }
        foreach (Page::query()->whereIn('id', array_values($pageCopies))->get() as $page) {
            if (is_array($page->content)) {
                $content = self::withDatabaseIds($page->content, $databaseCopies);
                if ($content !== $page->content) {
                    $page->forceFill(['content' => $content])->saveQuietly();
                }
            }
        }
    }

    /**
     * @param  array<int, mixed>  $blocks
     * @param  array<string, string>  $databaseCopies
     * @return array<int, mixed>
     */
    private static function withDatabaseIds(array $blocks, array $databaseCopies): array
    {
        foreach ($blocks as $i => $block) {
            if (! is_array($block)) {
                continue;
            }
            $id = $block['props']['databaseId'] ?? null;
            if (($block['type'] ?? null) === 'database' && is_string($id) && isset($databaseCopies[$id])) {
                $blocks[$i]['props']['databaseId'] = $databaseCopies[$id];
            }
            if (is_array($block['children'] ?? null)) {
                $blocks[$i]['children'] = self::withDatabaseIds($block['children'], $databaseCopies);
            }
        }

        return $blocks;
    }
}
