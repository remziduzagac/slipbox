<?php
/*
 * The old blog's RSS feed: an <item> per post.
 * The posts are index.php's posts().
 */
require __DIR__ . '/index.php';

trait Escapes
{
    private function esc(string $s): string
    {
        return htmlspecialchars($s, ENT_XML1);
    }
}

enum Format: string
{
    case Rss = 'rss';
    case Atom = 'atom';
}

class Feed
{
    use Escapes;

    public function items(array $posts): string
    {
        return implode("\n", array_map(fn ($p) => '<item>' . $this->esc($p->title) . '</item>', $posts));
    }
}

header('Content-Type: application/rss+xml');
echo (new Feed())->items(\OldBlog\posts());
