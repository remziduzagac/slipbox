<?php
// The front page of the old blog, before my notes moved to markdown (../stray-note.md says when).
declare(strict_types=1);

namespace OldBlog;

interface Renderable
{
    public function render(): string;
}

final class Post implements Renderable
{
    public function __construct(public string $title, private string $body) {}

    public function render(): string
    {
        return <<<HTML
        <article><h2>{$this->title}</h2>{$this->body}</article>
        HTML;
    }
}

function posts(): array
{
    return [new Post('Hello', '<p>First post.</p>')];
}
?>
<!doctype html>
<html>
<head>
  <title>Old blog</title>
</head>
<body>
  <h1 id="top">Old blog</h1>
  <?php foreach (posts() as $post): ?>
    <?= $post->render() ?>
  <?php endforeach; ?>
</body>
</html>
