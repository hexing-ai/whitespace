"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowDown, Info, X } from "lucide-react";
import { MountainAtmosphere } from "./MountainAtmosphere";
import "./home.css";

export default function CinematicHome({ brand, help, enter }: { brand: ReactNode; help: () => void; enter: (example: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuActive, setMenuActive] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const sections = [...element.querySelectorAll(".home-chapter")];
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
      }
      const current = sections.findLastIndex(section => visible.has(section));
      if (current < 0) return;
      for (const link of element.querySelectorAll<HTMLElement>("[data-chapter-link]")) {
        if (Number(link.dataset.chapterLink) === current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }, { rootMargin: "-80px 0px -20% 0px" });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!menuActive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuActive]);

  function openMenu() { menu.current?.showModal(); setMenuOpen(true); setMenuActive(true); }
  function closeMenu(action?: () => void) {
    setMenuOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { menu.current?.close(); setMenuActive(false); action?.(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
  }

  function jump(chapter: number) {
    const element = root.current;
    if (!element) return;
    const section = element.querySelectorAll<HTMLElement>(".home-chapter")[chapter];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduced ? "instant" : "smooth" });
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => section.querySelector<HTMLElement>("h1, h2")?.focus({ preventScroll: true }), reduced ? 0 : 1000);
  }

  return <div ref={root} className="cinematic-home" data-mode="natural">
    <header className="home-navbar">
      <button className="home-hamburger" aria-label="打开首页菜单" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="home-menu" onClick={openMenu}><span /><span /><span /></button>
      <nav className="home-nav-links" aria-label="产品导航">
        {["产品首页", "产品理念", "开始行动"].map((label, i) => <button key={label} data-chapter-link={i} onClick={() => jump(i)}>{label}</button>)}
      </nav>
      <div className="home-nav-actions">
        <button className="home-mobile-return" onClick={() => jump(0)}>产品首页</button>
        <button className="home-plan-entry" onClick={() => enter(false)}>开始规划 <span><ArrowRight size={12} aria-hidden="true" /></span></button>
        <button className="home-help-entry" onClick={help}>使用说明 <span><Info size={10} aria-hidden="true" /></span></button>
        <button className="home-menu-entry" aria-label="打开首页菜单" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="home-menu" onClick={openMenu}>菜单</button>
      </div>
    </header>
    <div className="home-scene">
      <section id="home-brand" className="home-chapter home-brand" aria-label="认识留白" data-visible="true">
        <MountainAtmosphere />
        <div className="home-brand-content">{brand}</div>
        <button className="home-down home-circle" aria-label="向下了解" onClick={() => jump(1)}><ArrowDown size={18} aria-hidden="true" /></button>
      </section>
      <section id="home-value" className="home-chapter home-value" aria-labelledby="home-value-title" data-visible="true">
        <div className="home-copy">
          <h2 id="home-value-title" tabIndex={-1}>想做的很多，<br /><span className="home-text-medium">这期先做好</span><span className="home-text-soft">什么？</span></h2>
          <p className="home-description">把成功标准、团队产能和需求放在一起，<br className="home-desktop-break" />看清这期能承诺什么，还有哪些条件需要确认。</p>
          <ol className="home-method">
            <li><span>01</span><div><h3>写清这期的目标</h3><p>确定成功标准、人数和周期，为规划划定边界。</p></div></li>
            <li><span>02</span><div><h3>列出需求与前置条件</h3><p>补充工作量，标记本期明确不做的内容。</p></div></li>
            <li><span>03</span><div><h3>核对 AI 分析与范围建议</h3><p>检查目标覆盖、依赖和原文依据，再带着结论进入规划会。</p></div></li>
          </ol>
          <button className="home-next home-circle" aria-label="了解如何开始" onClick={() => jump(2)}><ArrowDown size={18} aria-hidden="true" /></button>
        </div>
      </section>
      <section id="home-action" className="home-chapter home-action" aria-labelledby="home-action-title" data-visible="true">
        <div className="home-copy">
          <p className="home-eyebrow">留白 WhiteSpace</p>
          <h2 id="home-action-title" tabIndex={-1}>把讨论，变成<br />明确的本期边界。</h2>
          <div className="home-actions"><button className="home-cta" onClick={() => enter(false)}>开始规划 <span><ArrowRight size={16} aria-hidden="true" /></span></button><button className="home-example" onClick={() => enter(true)}>用示例体验</button></div>
        </div>
      </section>
    </div>
    <dialog id="home-menu" ref={menu} className="home-menu" aria-label="首页菜单" data-open={menuOpen} onCancel={event => { event.preventDefault(); closeMenu(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <button className="home-menu-close home-circle" aria-label="关闭首页菜单" onClick={() => closeMenu()}><X size={18} aria-hidden="true" /></button>
      <nav aria-label="首页菜单导航">
        {["产品首页", "产品理念", "开始行动"].map((label, i) => <button key={label} data-chapter-link={i} onClick={() => closeMenu(() => jump(i))}>{label}</button>)}
        <button onClick={() => closeMenu(() => enter(false))}>开始规划 <ArrowRight size={24} aria-hidden="true" /></button>
      </nav>
      <div className="home-menu-footer"><button onClick={() => closeMenu(help)}>使用说明</button><button onClick={() => closeMenu(() => enter(true))}>用示例体验</button></div>
    </dialog>
  </div>;
}
