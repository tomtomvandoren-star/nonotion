<?php

namespace App\Support;

use Closure;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;

/**
 * Envoi par la fonction mail() de PHP. Sur l'hébergement mutualisé, le PHP du site ne peut pas
 * lancer de commande (proc_open est désactivé), donc pas sendmail directement ; mail() le peut,
 * avec le sendmail_path réglé par l'hébergeur. Le message est celui que Symfony a préparé : on le
 * sépare en destinataire, sujet, en-têtes et corps, comme mail() les attend.
 */
class PhpMailTransport extends AbstractTransport
{
    /** @var Closure(string, string, string, string, string): bool */
    private Closure $mail;

    /** @param  Closure(string, string, string, string, string): bool|null  $mail  mail() (remplacé dans les tests) */
    public function __construct(?Closure $mail = null)
    {
        parent::__construct();
        $this->mail = $mail ?? fn (string $to, string $subject, string $body, string $headers, string $params) => mail($to, $subject, $body, $headers, $params);
    }

    protected function doSend(SentMessage $message): void
    {
        [$head, $body] = explode("\r\n\r\n", $message->toString(), 2) + [1 => ''];

        // mail() écrit lui-même To et Subject ; Bcc ne doit pas apparaître dans le message.
        $to = '';
        $subject = '';
        $headers = [];
        foreach (preg_split('/\r\n(?![ \t])/', $head) ?: [] as $line) {
            $name = strtolower(trim(strstr($line, ':', true) ?: ''));
            $value = trim((string) preg_replace('/\r\n(?=[ \t])/', '', substr($line, strlen($name) + 1)));
            match ($name) {
                'to' => $to = $value,
                'subject' => $subject = $value,
                'bcc' => null,
                default => $headers[] = $line,
            };
        }

        // L'expéditeur de l'enveloppe (-f) : les retours et les refus reviennent à cette adresse.
        $sender = $message->getEnvelope()->getSender()->getAddress();
        $params = filter_var($sender, FILTER_VALIDATE_EMAIL) ? '-f'.$sender : '';

        if (! ($this->mail)($to, $subject, $body, implode("\r\n", $headers), $params)) {
            throw new TransportException('mail() a refusé l’e-mail'.(error_get_last() ? ' : '.error_get_last()['message'] : '.'));
        }
    }

    public function __toString(): string
    {
        return 'phpmail://default';
    }
}
