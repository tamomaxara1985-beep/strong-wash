"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import type { HeroSlide, Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 6000;

/**
 * The homepage banners.
 *
 * Built on native scroll-snap rather than a slider library: swipe, trackpad
 * flick and keyboard scrolling then come from the browser, and if this component
 * never hydrates the markup is still a scrollable strip of images rather than an
 * empty box. The arrows, the dots and autoplay all drive the same `scrollTo`.
 *
 * Nothing is cropped. The artwork carries its message inside the picture with
 * text close to the edges, so each image is contained on a brand-black backdrop
 * and only the letterboxing changes with the viewport.
 */
export function HeroCarousel({ slides, locale }: { slides: HeroSlide[]; locale: Locale }) {
  const t = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
  }, []);

  // Which slide is showing, decided by what the browser actually scrolled to
  // rather than by a counter this component keeps — a swipe moves the track
  // without going through any of our handlers.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setCurrent(index);
          }
        }
      },
      { root: track, threshold: 0.6 },
    );

    for (const child of Array.from(track.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [slides.length]);

  // A hidden tab is tracked in state, not read inside the tick, so that a
  // background tab tears the interval down entirely rather than merely
  // skipping a tick — browsers throttle background timers but do not stop
  // them, so a check inside the callback would still let elapsed time accrue
  // while the visitor is away.
  useEffect(() => {
    const onVisibilityChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused || hidden) return;
    // Honouring the OS setting is not decoration: motion that starts on its own
    // is exactly what this preference exists to stop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const next = (current + 1) % slides.length;
      track.scrollTo({ left: track.clientWidth * next, behavior: "smooth" });
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [current, paused, hidden, slides.length]);

  if (!slides.length) return null;

  const many = slides.length > 1;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("home.promotions")}
      className="bg-brand-black relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => {
          const alt = pickLocale(slide.alt, locale);
          const image = (
            <Image
              src={slide.image}
              alt={alt}
              width={slide.width ?? 1600}
              height={slide.height ?? 900}
              sizes="100vw"
              priority={index === 0}
              className="h-full w-full object-contain"
            />
          );

          return (
            <div
              key={slide.id}
              data-index={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}`}
              className="aspect-[4/3] w-full shrink-0 snap-center sm:aspect-[16/9]"
            >
              {slide.href ? (
                <Link href={slide.href} className="block h-full w-full">
                  {image}
                </Link>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>

      {many ? (
        <>
          <button
            type="button"
            aria-label={t("home.prevSlide")}
            onClick={() => scrollToIndex((current - 1 + slides.length) % slides.length)}
            className="absolute top-1/2 left-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:flex"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t("home.nextSlide")}
            onClick={() => scrollToIndex((current + 1) % slides.length)}
            className="absolute top-1/2 right-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:flex"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                aria-label={t("home.goToSlide", { n: index + 1 })}
                aria-current={index === current ? "true" : undefined}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-2 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
                  index === current ? "bg-brand-yellow w-6" : "w-2 bg-white/60 hover:bg-white",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
