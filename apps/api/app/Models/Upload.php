<?php

namespace App\Models;

use App\Models\Scopes\VisibleToCurrentUser;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Un fichier envoyé dans une page (bloc Image, Vidéo, Audio ou Fichier). Il est servi tel quel
 * depuis public/uploads, à une adresse impossible à deviner (un identifiant aléatoire par fichier).
 *
 * @property string $id
 * @property string $workspace_id
 * @property string|null $page_id
 * @property string|null $user_id
 * @property string $name
 * @property string $path
 * @property string $mime
 * @property int $size
 */
#[Fillable(['workspace_id', 'page_id', 'user_id', 'name', 'path', 'mime', 'size'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class Upload extends Model
{
    use HasUlids;

    /**
     * Les extensions gardées telles quelles. Une autre (.php, .html, .js…) est retirée : le
     * serveur web ne doit jamais exécuter ni afficher comme une page ce qu'un utilisateur a envoyé.
     */
    public const EXTENSIONS = [
        // Images
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'heic', 'heif', 'tif', 'tiff',
        // Vidéos
        'mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi',
        // Sons
        'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'weba',
        // Documents et archives
        'pdf', 'txt', 'md', 'csv', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
        'odp', 'odg', 'epub', 'pages', 'numbers', 'key', 'ics', 'vcf', 'zip', '7z', 'rar', 'tar', 'gz',
    ];

    protected function casts(): array
    {
        return ['size' => 'integer'];
    }

    /**
     * Le nom sous lequel le fichier est rangé : lettres, chiffres, tirets, et une seule extension,
     * prise dans la liste. « photo.php.jpg » devient « photo-php.jpg », « page.html » « page ».
     */
    public static function safeName(string $original): string
    {
        $extension = strtolower(Str::ascii(pathinfo($original, PATHINFO_EXTENSION)));
        $base = Str::ascii(pathinfo($original, PATHINFO_FILENAME));
        $base = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '-', $base), '-_');
        $base = substr($base, 0, 80) ?: 'fichier';

        return in_array($extension, self::EXTENSIONS, true) ? "{$base}.{$extension}" : $base;
    }

    public function url(): string
    {
        return Storage::disk('uploads')->url($this->path);
    }

    /** @return array<string, mixed> */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url(),
            'name' => $this->name,
            'mime' => $this->mime,
            'size' => $this->size,
        ];
    }
}
