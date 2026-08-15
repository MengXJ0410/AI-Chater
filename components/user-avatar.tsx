"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { getAvatarInitial } from "@/lib/user-avatar";

type UserAvatarProps = {
  username: string;
  src?: string | null;
  className?: string;
};

export function UserAvatar({ username, src, className }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = getAvatarInitial(username);

  if (src && !failed) {
    return <span className={className} aria-label={`${username}的头像`}><img className="user-avatar-image" src={src} alt="" onError={() => setFailed(true)} /></span>;
  }

  return <span className={`${className ?? ""} user-avatar-fallback`} aria-label={`${username}的头像`}>{initial}</span>;
}
