import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { getBlogPost, getBlogPosts, togglePostLike, isPostLiked } from '../../firebase/blog';
import { CommentSection } from '../../components/blog/CommentSection';
import { useAuth } from '../../hooks/useAuth';
import type { BlogPost } from '../../types/blog';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/Card';

function renderMarkdown(content: string) {
  const blocks = content.split(/\n\n+/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (trimmed.startsWith('### ')) {
      return <h3 key={i} className="text-lg font-bold mt-6 mb-2 text-[var(--text-primary)]">{trimmed.slice(4)}</h3>;
    }
    if (trimmed.startsWith('## ')) {
      return <h2 key={i} className="text-xl font-bold mt-8 mb-3 text-[var(--text-primary)]">{trimmed.slice(3)}</h2>;
    }
    if (trimmed.startsWith('# ')) {
      return <h1 key={i} className="text-2xl font-bold mt-8 mb-3 text-[var(--text-primary)]">{trimmed.slice(2)}</h1>;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = trimmed.split('\n').filter((l) => l.startsWith('- ') || l.startsWith('* '));
      return (
        <ul key={i} className="list-disc pl-5 my-3 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="text-[var(--text-primary)] leading-7">{item.slice(2)}</li>
          ))}
        </ul>
      );
    }
    if (!trimmed) return null;
    return <p key={i} className="text-[var(--text-primary)] leading-7 my-3">{trimmed}</p>;
  });
}

function formatDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getBlogPost(slug).then(async (p) => {
      setPost(p);
      setLoading(false);
      if (p) {
        document.title = p.seo.metaTitle || p.title;
        let metaEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
        if (!metaEl) {
          metaEl = document.createElement('meta');
          metaEl.name = 'description';
          document.head.appendChild(metaEl);
        }
        metaEl.content = p.seo.metaDescription || p.excerpt;
        setLikeCount(p.likeCount);
        const all = await getBlogPosts('published');
        setRelated(all.filter((r) => r.category === p.category && r.id !== p.id).slice(0, 3));
        if (user) {
          const isLiked = await isPostLiked(p.id, user.uid);
          setLiked(isLiked);
        }
      }
    });
  }, [slug, user]);

  const handleLike = async () => {
    if (!post || !user || likeLoading) return;
    setLikeLoading(true);
    const newLiked = await togglePostLike(post.id, user.uid);
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : Math.max(0, c - 1));
    setLikeLoading(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-xl font-bold">Post not found</p>
          <Link to="/blog" className="text-blue-600 mt-4 inline-block">← Back to blog</Link>
        </div>
      </Layout>
    );
  }

  const paragraphs = post.content.split(/\n\n+/).filter((b) => b.trim());
  const ctaIndex = Math.floor(paragraphs.length * 0.4);
  const beforeCTA = paragraphs.slice(0, ctaIndex).join('\n\n');
  const afterCTA = paragraphs.slice(ctaIndex).join('\n\n');

  return (
    <Layout>
      <div className="max-w-[680px] mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <div className="text-sm text-[var(--text-secondary)] mb-6">
          <Link to="/blog" className="hover:text-blue-600 no-underline">Blog</Link>
          <span className="mx-2">›</span>
          <span>{post.category}</span>
        </div>

        {/* Header */}
        <Badge variant="info" className="mb-3 text-[0.7rem] uppercase tracking-wide">{post.category}</Badge>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-3 leading-tight">{post.title}</h1>
        <p className="text-[var(--text-secondary)] text-sm mb-6">
          By {post.author} · {formatDate(post.publishedAt)}
        </p>

        {post.featuredImage && (
          <img
            src={post.featuredImage}
            alt={post.title}
            className="w-full rounded-xl mb-8 object-cover max-h-80"
          />
        )}

        {/* Content before CTA */}
        <div className="prose max-w-none">
          {renderMarkdown(beforeCTA)}
        </div>

        {/* CTA block */}
        <Card className="my-8 p-6 text-center bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-0">
            <p className="font-semibold text-[var(--text-primary)] mb-3">
              {post.ctaText || 'Want feedback like this on your own essay? Try WriteReady free.'}
            </p>
            <Link
              to={post.ctaLink || '/auth?mode=signup'}
              className="inline-block bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg no-underline hover:bg-blue-700 transition-colors"
            >
              Get Started Free
            </Link>
          </CardContent>
        </Card>

        {/* Content after CTA */}
        <div className="prose max-w-none">
          {renderMarkdown(afterCTA)}
        </div>

        {/* Like button */}
        <div className="flex items-center gap-3 mt-10 pt-6 border-t border-[var(--border-color)]">
          <Button
            variant="outline"
            onClick={handleLike}
            disabled={!user || likeLoading}
            className={liked ? 'bg-red-50 border-red-300 text-red-600 dark:bg-red-900/20 dark:border-red-700 hover:bg-red-50' : ''}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {likeCount > 0 && <span>{likeCount}</span>}
            <span>{liked ? 'Liked' : 'Like'}</span>
          </Button>
          {!user && <span className="text-xs text-[var(--text-secondary)]">Sign in to like this post</span>}
        </div>

        {/* Comments */}
        <div className="mt-10">
          <CommentSection postId={post.id} />
        </div>

        {/* Related posts */}
        {related.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[var(--border-color)]">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-5">Related Posts</h3>
            <div className="flex flex-col gap-4">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/blog/${r.slug}`}
                  className="no-underline flex gap-4 group"
                >
                  {r.featuredImage ? (
                    <img src={r.featuredImage} alt={r.title} className="w-20 h-16 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-20 h-16 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 flex items-center justify-center text-2xl">📝</div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-blue-600 transition-colors line-clamp-2">{r.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{r.author}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
