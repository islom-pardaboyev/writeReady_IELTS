import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getComments, addComment, toggleCommentLike, createLikeNotification } from '../../firebase/blog';
import type { BlogComment } from '../../types/blog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';

function relativeTime(d: Date | null): string {
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

interface Props {
  postId: string;
}

export function CommentSection({ postId }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    getComments(postId).then((c) => {
      setComments(c);
      setLoading(false);
    });
  }, [postId]);

  const handlePost = async () => {
    if (!user || !text.trim() || posting) return;
    setPosting(true);
    const optimistic: BlogComment = {
      id: `temp-${Date.now()}`,
      userId: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL || '',
      text: text.trim(),
      createdAt: new Date(),
      likeCount: 0,
    };
    setComments((prev) => [optimistic, ...prev]);
    setText('');
    try {
      await addComment(postId, {
        userId: optimistic.userId,
        displayName: optimistic.displayName,
        photoURL: optimistic.photoURL,
        text: optimistic.text,
      });
      const fresh = await getComments(postId);
      setComments(fresh);
    } catch (e) {
      console.error(e);
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
    }
    setPosting(false);
  };

  const handleCommentLike = async (comment: BlogComment) => {
    if (!user) return;
    const newCount = await toggleCommentLike(postId, comment.id, user.uid);
    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, likeCount: newCount } : c)),
    );
    await createLikeNotification(
      postId,
      '',
      comment.id,
      comment.userId,
      user.uid,
      user.displayName || user.email?.split('@')[0] || 'User',
      comment.text.slice(0, 60),
    );
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-5">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      {/* Input */}
      <div className="mb-6">
        <Textarea
          rows={3}
          placeholder={user ? 'Write a comment…' : 'Sign in to comment'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!user}
          className="mb-2"
        />
        {!user ? (
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            <a href="/auth?mode=login" className="text-blue-600 hover:underline">Sign in</a> to leave a comment.
          </p>
        ) : (
          <Button
            onClick={handlePost}
            disabled={!text.trim() || posting}
            loading={posting}
            size="sm"
          >
            {posting ? 'Posting…' : 'Post comment'}
          </Button>
        )}
      </div>

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] text-center py-6">No comments yet. Be the first!</p>
      ) : (
        <div className="flex flex-col gap-5">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="shrink-0">
                <Avatar className="w-9 h-9">
                  {c.photoURL ? <AvatarImage src={c.photoURL} alt={c.displayName} /> : null}
                  <AvatarFallback className="text-xs">{initials(c.displayName)}</AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{c.displayName}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{relativeTime(c.createdAt)}</span>
                </div>
                <p className="text-sm text-[var(--text-primary)] leading-6">{c.text}</p>
                <button
                  onClick={() => handleCommentLike(c)}
                  className="mt-1.5 flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                  disabled={!user}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  {c.likeCount > 0 && <span>{c.likeCount}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
