"use client";

import { useState } from "react";
import { TeamCrest } from "@/components/team-crest";
import { lastPlayedLabel, safeLogoUrl, type ProSuggestion } from "@/lib/pros";
import { cn } from "@/lib/utils";

/** Selo de pro verificado (o "is_locked" da OpenDota). */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="verificado"
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-ember text-[9px] font-extrabold leading-none text-background",
        className,
      )}
    >
      ✓
    </span>
  );
}

/** Avatar da Steam; sem avatar (ou se não carregar), um quadrado com a inicial. */
export function ProAvatar({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = safeLogoUrl(src);
  const box = { width: size, height: size };

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-md bg-line object-cover"
        style={box}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md bg-line font-display font-bold uppercase text-muted-foreground"
      style={{ ...box, fontSize: Math.round(size * 0.5) }}
    >
      {Array.from(name.trim())[0] ?? "?"}
    </span>
  );
}

/**
 * Nick com o trecho digitado em destaque — só quando o nick contém o texto
 * literalmente. Se o banco achou por semelhança ("yatorro"), sem destaque.
 */
function Nick({ name, query }: { name: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const at = needle ? name.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <span className="truncate">{name}</span>;
  return (
    <span className="truncate">
      {name.slice(0, at)}
      <span className="text-ember">{name.slice(at, at + needle.length)}</span>
      {name.slice(at + needle.length)}
    </span>
  );
}

/** Uma linha do dropdown da busca (opção B dos mockups da v2.1). */
export function ProSuggestionRow({
  id,
  pro,
  query,
  active,
  nowMs,
  onSelect,
  onHover,
}: {
  id: string;
  pro: ProSuggestion;
  query: string;
  active: boolean;
  nowMs: number;
  onSelect: () => void;
  onHover: () => void;
}) {
  const played = lastPlayedLabel(pro.lastMatchTime, nowMs);
  const team = pro.teamName?.trim();

  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      // Sem isto o clique tira o foco do campo e a lista fecha antes do onClick.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 border-l-2 border-transparent px-2.5 py-2 text-left",
        active && "border-ember bg-white/5",
      )}
    >
      <ProAvatar src={pro.avatar} name={pro.name} size={pro.verified ? 40 : 32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
          <Nick name={pro.name} query={query} />
          {pro.verified && <VerifiedBadge />}
        </div>
        <div className="mt-px truncate text-[11px] font-normal text-muted-foreground">
          {team ? `${team} · ${played}` : played}
        </div>
      </div>
      <TeamCrest
        logo={pro.verified ? pro.teamLogo : null}
        tag={pro.teamTag}
        size={32}
      />
    </div>
  );
}
