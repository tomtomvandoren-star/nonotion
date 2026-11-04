<?php

namespace App\Support;

/**
 * Extrait le texte brut d'un document BlockNote (tableau de blocs) pour la recherche
 * plein texte (colonne search_text). Un bloc : { type, content: string | inline[], children: bloc[] }.
 */
class BlockText
{
    private const MAX_LENGTH = 1_000_000;

    /** @param array<int, mixed>|null $blocks */
    public static function extract(?array $blocks): string
    {
        $lines = [];
        self::collect($blocks ?? [], $lines);

        return mb_substr(implode("\n", $lines), 0, self::MAX_LENGTH);
    }

    /**
     * @param  array<int, mixed>  $blocks
     * @param  list<string>  $lines
     */
    private static function collect(array $blocks, array &$lines): void
    {
        foreach ($blocks as $block) {
            if (! is_array($block)) {
                continue;
            }
            $text = self::inline($block['content'] ?? null);
            if ($text !== '') {
                $lines[] = $text;
            }
            if (is_array($block['children'] ?? null)) {
                self::collect($block['children'], $lines);
            }
        }
    }

    private static function inline(mixed $content): string
    {
        if (is_string($content)) {
            return $content;
        }
        if (! is_array($content)) {
            return '';
        }

        $text = '';
        foreach ($content as $item) {
            if (is_string($item)) {
                $text .= $item;
            } elseif (is_array($item)) {
                // Texte simple ({ type: "text", text }) ou lien ({ type: "link", content: [...] }).
                $text .= is_string($item['text'] ?? null) ? $item['text'] : self::inline($item['content'] ?? null);
            }
        }

        return $text;
    }
}
