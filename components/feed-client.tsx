"use client";

import { Camera, ChevronDown, CircleUserRound, Flag, Heart, Link2, MessageCircle, MoreHorizontal, Send, Share2, Trash2, UserPlus, UsersRound } from "lucide-react";
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
  const { t } = useI18n();
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
      setBody(""); setExternalUrl(""); setMedia([]); await load(true);
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

  return (
    <AppShell><main className="page-shell"><div className="page-narrow" style={{ display: "grid", gap: 16 }}>
      <header><h1 className="section-title" style={{ fontSize: "2rem" }}>{t("feed.title")}</h1></header>
      <form className="feed-card" onSubmit={publish}>
        <div style={{ display: "flex", gap: 11 }}><div className="avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="avatar" /> : <CircleUserRound />}</div><textarea className="textarea" style={{ minHeight: 88 }} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("feed.composer")} maxLength={5000} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 10 }}><input className="input" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://" /><label className="secondary-button" style={{ padding: "0 14px" }}><Camera size={19} /><span>{media.length || ""}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={(event) => setMedia(Array.from(event.target.files ?? []).slice(0, 6))} /></label></div>
        <button className="primary-button" style={{ width: "100%", marginTop: 10 }} disabled={publishing}>{publishing ? t("common.loading") : <><Send size={18} />{t("feed.publish")}</>}</button>
      </form>
      {loading ? <LoadingCards count={4} /> : error ? <ErrorState message={t("common.error")} /> : !posts.length ? <EmptyState message={t("feed.empty")} /> : posts.map((post) => (
        <article key={post.id} className="feed-card">
          {post.is_pinned && <div style={{ color: "#2a69ce", fontWeight: 800, marginBottom: 12 }}>📌 {t("feed.pinned")}</div>}
          <div className="post-head">
            <Link href={`/profile?user=${post.author.id}`} className="avatar">{post.author.avatar_url ? <img src={post.author.avatar_url} alt="" className="avatar" /> : <CircleUserRound />}</Link>
            <div><div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}><strong>{post.author.full_name}</strong>{post.author.badge_label && <span className="status active">{post.author.badge_label}</span>}</div><span className="muted" style={{ fontSize: ".8rem" }}>{new Date(post.created_at).toLocaleString()}</span></div>
            <div style={{ position: "relative" }}><button className="secondary-button" style={{ minHeight: 42, width: 42, padding: 0 }} onClick={() => setMenuFor(menuFor === post.id ? null : post.id)}><MoreHorizontal /></button>{menuFor === post.id && <div className="card" style={{ position: "absolute", zIndex: 8, right: 0, top: 48, width: 180, padding: 8 }}>{post.author_id === user?.id ? <button className="drawer-link danger" style={{ border: 0, background: "transparent", width: "100%" }} onClick={() => void deletePost(post)}><Trash2 size={17} />Delete</button> : <button className="drawer-link" style={{ border: 0, background: "transparent", width: "100%" }} onClick={() => void reportPost(post)}><Flag size={17} />Report</button>}</div>}</div>
          </div>
          {post.author_id !== user?.id && <button className="secondary-button" style={{ minHeight: 39, marginTop: 10 }} onClick={() => void connect(post)} disabled={post.connection_status !== "none"}>{post.connection_status === "connected" ? <UsersRound size={17} /> : <UserPlus size={17} />}{post.connection_status === "connected" ? t("feed.connected") : post.connection_status === "pending" ? t("feed.pending") : t("feed.connect")}</button>}
          {post.body && <p className="post-body">{post.body}</p>}
          {post.media?.length > 0 && <div className="post-media">{post.media.map((item) => item.public_url && <img key={item.id} src={item.public_url} alt="" loading="lazy" />)}</div>}
          {post.external_url && isSafeExternalUrl(post.external_url) && <a className="soft-card" href={post.external_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, marginTop: 12, color: "inherit", textDecoration: "none" }}><Link2 size={21} />{post.external_url}</a>}
          <div className="post-metrics"><span>{post.like_count} {t("feed.like")}</span><span>{post.comment_count} {t("feed.comment")}</span></div>
          <div className="post-actions"><button className={`post-action ${post.liked_by_me ? "active" : ""}`} onClick={() => void toggleLike(post)}><Heart size={20} fill={post.liked_by_me ? "currentColor" : "none"} />{post.liked_by_me ? t("feed.unlike") : t("feed.like")}</button><button className="post-action" onClick={() => void openComments(post)}><MessageCircle size={20} />{t("feed.comment")}</button><button className="post-action" onClick={() => void share(post)}><Share2 size={20} />{t("feed.share")}</button></div>
        </article>
      ))}
      {!loading && hasMore && posts.length > 0 && <button className="secondary-button" onClick={() => void load(false, page + 1)}><ChevronDown size={19} />Load more</button>}
    </div></main>
    {commentsFor && <Modal title={t("feed.comment")} onClose={() => setCommentsFor(null)}><div style={{ display: "grid", gap: 12, maxHeight: "50vh", overflow: "auto" }}>{comments.length ? comments.map((comment) => <div key={comment.id} className="soft-card" style={{ padding: 12, display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 9 }}><div className="avatar" style={{ width: 38, height: 38 }}>{comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt="" className="avatar" style={{ width: 38, height: 38 }} /> : <CircleUserRound size={20} />}</div><div><strong>{comment.author?.full_name ?? "Member"}</strong><div>{comment.body}</div><span className="muted" style={{ fontSize: ".72rem" }}>{new Date(comment.created_at).toLocaleString()}</span></div>{comment.user_id === user?.id && <button className="secondary-button" style={{ width: 38, minHeight: 38, padding: 0 }} onClick={async () => { const supabase = getSupabaseBrowserClient(); if (supabase) { await supabase.from("comments").delete().eq("id", comment.id); await openComments(commentsFor); } }}><Trash2 size={15} /></button>}</div>) : <p className="muted">No comments yet.</p>}</div><form onSubmit={addComment} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 14 }}><input className="input" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={t("feed.writeComment")} maxLength={2000} /><button className="primary-button" style={{ padding: "0 15px" }}><Send size={18} /></button></form></Modal>}
    </AppShell>
  );
}
