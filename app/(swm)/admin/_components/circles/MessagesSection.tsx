"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { colors } from "../../../../../lib/design-tokens";
import { parseActorKeyClient } from "../../../../../lib/parse-actor-key-client";
import type { CircleMessage } from "../../../../../lib/admin-metrics";
import { SectionCard } from "./SectionCard";
import { fmtAgo } from "./shared";

export function MessagesSection({ messages, onOpenChat }: { messages: CircleMessage[]; onOpenChat: (actorKey: string) => void }) {
  const [filter, setFilter] = useState<"all" | "active" | "deleted">("all");
  const [roomFilter, setRoomFilter] = useState("");

  const filtered = messages.filter(m => {
    if (filter === "active" && m.deleted_at) return false;
    if (filter === "deleted" && !m.deleted_at) return false;
    if (!roomFilter.trim()) return true;
    const q = roomFilter.toLowerCase();
    const room = parseActorKeyClient(m.actor_key);
    const roomText = room ? `${room.name} ${room.state ?? ""} ${room.role}`.toLowerCase() : m.actor_key.toLowerCase();
    return roomText.includes(q) || m.actor_key.toLowerCase().includes(q);
  });

  return (
    <SectionCard
      title={`Messages · ${messages.length} recent`}
      className="mt-8"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            placeholder="Filter room/actor"
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as "all" | "active" | "deleted")}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      }
    >
      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-white/50">No messages match this filter.</p>}
        {filtered.map((m, i) => {
          const room = parseActorKeyClient(m.actor_key);
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.01 }}
              onClick={() => onOpenChat(m.actor_key)}
              className="cursor-pointer rounded-xl p-3 transition-colors hover:bg-white/[0.07]"
              style={{
                backgroundColor: m.deleted_at ? "rgba(185,28,28,0.08)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${m.deleted_at ? "rgba(185,28,28,0.25)" : colors.hairline.subtle}`,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>
                <span className="font-bold text-white/80">{m.sender_handle ?? m.sender_email}</span>
                <span>{room ? `${room.name} · ${room.role}${room.state ? ` · ${room.state}` : ""}` : m.actor_key}</span>
                <span>{fmtAgo(m.created_at)}</span>
              </div>
              <p className={`mt-2 text-sm whitespace-pre-wrap ${m.deleted_at ? "text-white/50 line-through" : "text-white/90"}`}>{m.body}</p>
              {m.deleted_at && (
                <p className="mt-1 text-xs text-red-300">
                  Deleted by {m.deleted_by || "unknown"} · {fmtAgo(m.deleted_at)}
                </p>
              )}
              <div className="mt-2 flex items-center justify-end gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/40">Click to open side chat</span>
                <Link
                  href={`/admin/circles/${encodeURIComponent(m.actor_key)}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] font-bold uppercase tracking-wide text-amber-300/80 hover:text-amber-300"
                >
                  Open full page →
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </SectionCard>
  );
}
