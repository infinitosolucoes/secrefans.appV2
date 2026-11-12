import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/domain/Avatar";
import { buttonClasses } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { getSessionUser } from "@/server/auth/session";
import { deleteCommentAction } from "@/features/content/actions";
import { CommentForm } from "@/features/content/CommentForm";
import { UUID_RE } from "@/features/content/constants";
import { PostCard } from "@/features/content/PostCard";
import { ReportButton } from "@/features/content/interactions";
import { getComments, getPost } from "@/features/content/queries";

export const metadata: Metadata = { title: "Publicação", robots: { index: false } };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [post, user] = await Promise.all([getPost(id), getSessionUser()]);
  if (!post) notFound();
  const comments = user ? await getComments(post.id) : [];

  return (
    <AppShell user={user}>
      <div className="flex max-w-2xl flex-col gap-6">
        <Link
          href={user ? "/inicio" : `/${post.handle}`}
          className="type-label text-accent-text hover:underline"
        >
          ← {user ? "Voltar ao feed" : `Perfil de @${post.handle}`}
        </Link>
        <PostCard post={post} loggedIn={Boolean(user)} linkToPost={false} viewerId={user?.id} />

        <section aria-labelledby="comentarios" className="flex flex-col gap-4">
          <h2 id="comentarios" className="type-feature-title text-ink">
            Comentários ({post.commentCount})
          </h2>
          {!user ? (
            <p className="type-body text-ink-muted">
              <Link href="/entrar" className="text-accent-text underline">
                Entre
              </Link>{" "}
              para ver e escrever comentários.
            </p>
          ) : (
            <>
              <CommentForm postId={post.id} />
              {comments.length === 0 ? (
                <p className="type-body text-ink-muted">Seja a primeira pessoa a comentar.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className="flex gap-3 rounded-md border border-border bg-surface-alt p-4"
                    >
                      <Avatar path={null} name={c.authorName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="type-caption text-ink-muted">
                          {c.authorHandle ? (
                            <Link
                              href={`/${c.authorHandle}`}
                              className="font-semibold text-ink hover:underline"
                            >
                              {c.authorName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-ink">{c.authorName}</span>
                          )}{" "}
                          · {formatRelative(c.createdAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-line type-body text-ink">{c.body}</p>
                      </div>
                      <div className="flex shrink-0 items-start">
                        {c.authorId === user.id ? (
                          <form action={deleteCommentAction}>
                            <input type="hidden" name="commentId" value={c.id} />
                            <input type="hidden" name="postId" value={post.id} />
                            <button type="submit" className={buttonClasses("ghost", "sm")}>
                              Apagar
                            </button>
                          </form>
                        ) : (
                          <ReportButton targetType="comment" targetId={c.id} loggedIn />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
