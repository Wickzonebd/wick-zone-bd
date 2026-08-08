"use client";

import { ChevronDown, CircleUserRound, Flag, Link2, MessageCircle, MoreHorizontal, Send, Share2, ThumbsUp, Trash2, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { EmptyState, ErrorState, LoadingCards, Modal } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl, safeFileName } from "@/lib/url";
import type { FeedPost, PublicProfile } from "@/lib/types";

interface FeedComment { id: string; body: string; created_at: string; user_id: string; author: PublicProfile | null; }

export function FeedClient() {
  const { t, language } = useI18n();
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [media, setMedia] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [commentsFor, setCommentsFor] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (reset = true, requestedPage = 0) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    const offset = reset ? 0 : requestedPage * 10;
    const { data, error: queryError } = await supabase.rpc("list_feed", { p_limit: 10, p_offset: offset });
    const next = (data as FeedPost[]) ?? [];
    setPosts((current) => reset ? next : [...current, ...next]);
    setHasMore(next.length === 10);
    if (!reset) setPage(requestedPage); else setPage(0);
    setError(Boolean(queryError));
    setLoading(false);
  }, []);

  useEffect(() => { void load(true); }, [load]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || (!body.trim() && !media.length && !externalUrl.trim())) return;
    if (externalUrl && !isSafeExternalUrl(externalUrl)) { setError(true); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPublishing(true);
    const { data: post, error: postError } = await supabase.from("posts").insert({ author_id: user.id, body: body.trim() || null, external_url: externalUrl.trim() || null }).select("id").single();
    if (!postError && post) {
      let order = 0;
      for (const file of media.slice(0, 6)) {
        if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) continue;
        const storagePath = `${user.id}/${post.id}/${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from("post-media").upload(storagePath, file, { contentType: file.type, upsert: false });
        if (!uploadError) {
          const { data: publicData } = supabase.storage.from("post-media").getPublicUrl(storagePath);
          await supabase.from("post_media").insert({ post_id: post.id, storage_path: storagePath, public_url: publicData.publicUrl, sort_order: order++ });
        }
      }
      setBody(""); setExternalUrl(""); setMedia([]); setComposerOpen(false); await load(true);
    } else setError(true);
    setPublishing(false);
  };

  const toggleLike = async (post: FeedPost) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (post.liked_by_me) await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    else await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
    await load(true);
  };

  const openComments = async (post: FeedPost) => {
    setCommentsFor(post);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from("comments").select("id,body,created_at,user_id,author:profiles!comments_user_id_fkey(id,full_name,avatar_url,bio,badge_label,referral_code,created_at,is_suspended)").eq("post_id", post.id).eq("is_hidden", false).order("created_at");
    setComments((data as unknown as FeedComment[]) ?? []);
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !commentsFor || !commentBody.trim()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.from("comments").insert({ post_id: commentsFor.id, user_id: user.id, body: commentBody.trim() });
    setCommentBody(""); await openComments(commentsFor); await load(true);
  };

  const connect = async (post: FeedPost) => {
    if (post.author_id === user?.id || post.connection_status !== "none") return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    await supabase.rpc("send_connection_request", { p_addressee_id: post.author_id });
    await load(true);
  };

  const share = async (post: FeedPost) => {
    const url = `${window.location.origin}/feed?post=${post.id}`;
    if (navigator.share) await navigator.share({ title: post.author.full_name, text: post.body ?? undefined, url });
    else await navigator.clipboard.writeText(url);
  };

  const deletePost = async (post: FeedPost) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    if (!window.confirm("Delete this post?")) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setMenuFor(null); await load(true);
  };

  const reportPost = async (post: FeedPost) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    await supabase.from("content_reports").insert({ reporter_id: user.id, post_id: post.id, reason: "User reported content" });
    setMenuFor(null);
  };

  const closeComposer = () => {
    if (publishing) return;
    setComposerOpen(false);
    setBody("");
    setExternalUrl("");
    setMedia([]);
  };

  const composerCopy = language === "bn"
    ? { live: "লাইভ", photo: "ফটো", feeling: "ফিলিং", title: "পোস্ট তৈরি করুন", you: "আপনি", public: "পাবলিক", link: "লিংক (ঐচ্ছিক)" }
    : { live: "Live", photo: "Photo", feeling: "Feeling", title: "Create post", you: "You", public: "Public", link: "Link (optional)" };

  const profileInitial = profile?.full_name?.trim().charAt(0).toUpperCase() || "আ";

  return (
    <AppShell variant="feed"><main className="facebook-feed-main"><div className="facebook-feed-container">
      <section className="facebook-create-post" aria-label={composerCopy.title}>
        <div className="facebook-create-top">
          <div className="facebook-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : profileInitial}</div>
          <button type="button" className="facebook-status-input" onClick={() => setComposerOpen(true)}>{t("feed.composer")}</button>
        </div>
        <div className="facebook-create-actions">
          <button type="button" className="facebook-create-action" onClick={() => setComposerOpen(true)}><span>🎥</span>{composerCopy.live}</button>
          <label className="facebook-create-action"><span>🖼️</span>{composerCopy.photo}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { setMedia(Array.from(event.target.files ?? []).slice(0, 6)); setComposerOpen(true); event.currentTarget.value = ""; }} /></label>
          <button type="button" className="facebook-create-action" onClick={() => setComposerOpen(true)}><span>😊</span>{composerCopy.feeling}</button>
        </div>
      </section>
      {loading ? <LoadingCards count={4} /> : error ? <ErrorState message={t("common.error")} /> : !posts.length ? <EmptyState message={t("feed.empty")} /> : posts.map((post) => (
        <article key={post.id} className="facebook-post">
          {post.is_pinned && <div className="facebook-pinned">📌 {t("feed.pinned")}</div>}
          <div className="facebook-post-header">
            <Link href={`/profile?user=${post.author.id}`} className="facebook-avatar">{post.author.avatar_url ? <img src={post.author.avatar_url} alt="" /> : post.author.full_name?.trim().charAt(0).toUpperCase() || "M"}</Link>
            <div className="facebook-post-info"><div className="facebook-post-name"><strong>{post.author.full_name}</strong>{post.author.badge_label && <span className="status active">{post.author.badge_label}</span>}</div><span>{new Date(post.created_at).toLocaleString()} · 🌍</span></div>
            <div className="facebook-post-menu-wrap"><button type="button" className="facebook-more-button" aria-label="Post menu" onClick={() => setMenuFor(menuFor === post.id ? null : post.id)}><MoreHorizontal size={22} /></button>{menuFor === post.id && <div className="facebook-post-menu">{post.author_id === user?.id ? <button className="drawer-link danger" style={{ border: 0, background: "transparent", width: "100%" }} onClick={() => void deletePost(post)}><Trash2 size={17} />Delete</button> : <button className="drawer-link" style={{ border: 0, background: "transparent", width: "100%" }} onClick={() => void reportPost(post)}><Flag size={17} />Report</button>}</div>}</div>
          </div>
          {post.author_id !== user?.id && <button type="button" className="facebook-connect-button" onClick={() => void connect(post)} disabled={post.connection_status !== "none"}>{post.connection_status === "connected" ? <UsersRound size={16} /> : <UserPlus size={16} />}{post.connection_status === "connected" ? t("feed.connected") : post.connection_status === "pending" ? t("feed.pending") : t("feed.connect")}</button>}
          {post.body && <p className="facebook-post-content">{post.body}</p>}
          {post.media?.length > 0 && <div className="facebook-post-media">{post.media.map((item) => item.public_url && <img key={item.id} src={item.public_url} alt="" loading="lazy" />)}</div>}
          {post.external_url && isSafeExternalUrl(post.external_url) && <a className="facebook-post-link" href={post.external_url} target="_blank" rel="noreferrer"><Link2 size={19} />{post.external_url}</a>}
          <div className="facebook-post-stats"><span>👍 {post.like_count}</span><span>{post.comment_count} {t("feed.comment")}</span></div>
          <div className="facebook-post-actions"><button type="button" className={`facebook-post-action ${post.liked_by_me ? "liked" : ""}`} onClick={() => void toggleLike(post)}><ThumbsUp size={19} fill={post.liked_by_me ? "currentColor" : "none"} />{post.liked_by_me ? t("feed.unlike") : t("feed.like")}</button><button type="button" className="facebook-post-action" onClick={() => void openComments(post)}><MessageCircle size={19} />{t("feed.comment")}</button><button type="button" className="facebook-post-action" onClick={() => void share(post)}><Share2 size={19} />{t("feed.share")}</button></div>
        </article>
      ))}
      {!loading && hasMore && posts.length > 0 && <button type="button" className="facebook-load-more" onClick={() => void load(false, page + 1)}><ChevronDown size={19} />{language === "bn" ? "আরও দেখুন" : "Load more"}</button>}
    </div></main>
    {composerOpen && <div className="facebook-composer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeComposer()}><form className="facebook-composer-modal" onSubmit={publish} onMouseDown={(event) => event.stopPropagation()}>
      <div className="facebook-composer-header"><h3>{composerCopy.title}</h3><button type="button" className="facebook-composer-close" onClick={closeComposer} aria-label={t("common.close")}>×</button></div>
      <div className="facebook-composer-body">
        <div className="facebook-composer-user"><div className="facebook-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : profileInitial}</div><div><strong>{profile?.full_name || composerCopy.you}</strong><small>🌍 {composerCopy.public}</small></div></div>
        <textarea className="facebook-composer-textarea" autoFocus value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("feed.composer")} maxLength={5000} />
        <div className="facebook-composer-extras"><input className="facebook-link-input" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder={`${composerCopy.link} — https://`} /><label className="facebook-photo-picker">🖼️ {composerCopy.photo}{media.length ? ` (${media.length})` : ""}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { setMedia(Array.from(event.target.files ?? []).slice(0, 6)); event.currentTarget.value = ""; }} /></label></div>
      </div>
      <div className="facebook-composer-footer"><button className="facebook-post-button" disabled={publishing || (!body.trim() && !media.length && !externalUrl.trim())}>{publishing ? t("common.loading") : t("feed.publish")}</button></div>
    </form></div>}
    {commentsFor && <Modal title={t("feed.comment")} onClose={() => setCommentsFor(null)}><div style={{ display: "grid", gap: 12, maxHeight: "50vh", overflow: "auto" }}>{comments.length ? comments.map((comment) => <div key={comment.id} className="soft-card" style={{ padding: 12, display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 9 }}><div className="avatar" style={{ width: 38, height: 38 }}>{comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt="" className="avatar" style={{ width: 38, height: 38 }} /> : <CircleUserRound size={20} />}</div><div><strong>{comment.author?.full_name ?? "Member"}</strong><div>{comment.body}</div><span className="muted" style={{ fontSize: ".72rem" }}>{new Date(comment.created_at).toLocaleString()}</span></div>{comment.user_id === user?.id && <button className="secondary-button" style={{ width: 38, minHeight: 38, padding: 0 }} onClick={async () => { const supabase = getSupabaseBrowserClient(); if (supabase) { await supabase.from("comments").delete().eq("id", comment.id); await openComments(commentsFor); } }}><Trash2 size={15} /></button>}</div>) : <p className="muted">No comments yet.</p>}</div><form onSubmit={addComment} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 14 }}><input className="input" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={t("feed.writeComment")} maxLength={2000} /><button className="primary-button" style={{ padding: "0 15px" }}><Send size={18} /></button></form></Modal>}
    </AppShell>
  );
}
