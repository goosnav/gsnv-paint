/**
 * PURPOSE    Present or print a validated slide deck through the browser.
 * KIND       SHELL
 * CONTRACT   IN: live root, then deck/title/start slide. OUT: modal keyboard presentation or one print page per slide.
 *            RAISES: TypeError for invalid host; visible caller-owned errors for unavailable dialog/print/image decode.
 * GUARANTEES Same scene renderer as editing; local image data only; cleanup on close/dispose; focus restored.
 * TUNING     Print page size is deck pixels / 96 inches, zero margins; frame cleanup fallback 120 seconds.
 * DECISIONS  D1: Browser printing preserves text and layout without a second PDF engine. Alternative:
 *            bespoke PDF drawing would duplicate rendering. Revisit if direct PDF downloads are required.
 * LIMITS     Browser print dialog and Save as PDF are user controlled; no claim of disk persistence.
 * TESTBENCH  src/slides/slides-playback.test.ts -- run with: node --import tsx --test src/slides/slides-playback.test.ts
 */
import type { SlidesDocument } from './slides-document.ts';
import { slidesScene } from './slides-scene.ts';
export function slidesPlayback(root: HTMLElement): { present(deck: SlidesDocument, slideId: string): void; print(deck: SlidesDocument, title: string): Promise<void>; dispose(): void } {
  if (!root?.ownerDocument.defaultView || !root.isConnected) throw new TypeError('A live Slides host is required.');
  const doc=root.ownerDocument,win=doc.defaultView!,cleanups=new Set<()=>void>();let disposed=false,closePresentation:(()=>void)|null=null;
  return {
    present(deck,slideId) {
      if(disposed)return;closePresentation?.();const opener=doc.activeElement as HTMLElement|null,dialog=doc.createElement('dialog');dialog.className='slides-presentation';dialog.setAttribute('aria-label','Slide presentation');
      if(typeof dialog.showModal!=='function')throw new Error('Presentation dialogs are unavailable in this browser.');
      Object.assign(dialog.style,{position:'fixed',inset:'0',margin:'0',padding:'16px',width:'100vw',height:'100vh',maxWidth:'none',maxHeight:'none',boxSizing:'border-box',background:'#111',color:'#fff',border:'0'});
      const controls=doc.createElement('div'),previous=doc.createElement('button'),next=doc.createElement('button'),close=doc.createElement('button'),label=doc.createElement('span'),holder=doc.createElement('div');
      previous.textContent='Previous';next.textContent='Next';close.textContent='Close presentation';for(const button of[previous,next,close]){button.type='button';button.className='xp-button';}controls.style.cssText='display:flex;gap:10px;align-items:center;margin-bottom:16px';label.setAttribute('aria-live','polite');controls.append(previous,next,label,close);holder.style.margin='auto';dialog.append(controls,holder);
      let index=Math.max(0,deck.slides.findIndex(s=>s.id===slideId));
      const draw=()=>{const slide=deck.slides[index]!,scene=slidesScene(doc,deck,slide.id),scale=Math.min((win.innerWidth-32)/deck.width,(win.innerHeight-90)/deck.height);holder.replaceChildren(scene);holder.style.width=`${deck.width*scale}px`;holder.style.height=`${deck.height*scale}px`;scene.style.transformOrigin='top left';scene.style.transform=`scale(${scale})`;label.textContent=`${index+1} of ${deck.slides.length} — ${slide.name}`;previous.disabled=index===0;next.disabled=index===deck.slides.length-1;};
      const move=(to:number)=>{index=Math.max(0,Math.min(deck.slides.length-1,to));draw();};
      const cleanup=()=>{win.removeEventListener('resize',draw);dialog.remove();closePresentation=null;if(opener?.isConnected)opener.focus({preventScroll:true});};
      closePresentation=cleanup;previous.onclick=()=>move(index-1);next.onclick=()=>move(index+1);close.onclick=cleanup;dialog.addEventListener('cancel',event=>{event.preventDefault();cleanup();});
      dialog.addEventListener('keydown',event=>{if(['ArrowRight','PageDown',' '].includes(event.key)){event.preventDefault();move(index+1);}else if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();move(index-1);}else if(event.key==='Home'){event.preventDefault();move(0);}else if(event.key==='End'){event.preventDefault();move(deck.slides.length-1);}else if(event.key==='Escape'){event.preventDefault();cleanup();}event.stopPropagation();});
      root.append(dialog);draw();dialog.showModal();close.focus();win.addEventListener('resize',draw);
    },
    print(deck,title) {
      if(disposed)return Promise.resolve();
      const printed=doc.implementation.createHTMLDocument(title),meta=printed.createElement('meta'),style=printed.createElement('style');meta.setAttribute('charset','utf-8');
      style.textContent=`@page { size: ${deck.width/96}in ${deck.height/96}in; margin: 0; } html,body{margin:0;padding:0;} *{print-color-adjust:exact;-webkit-print-color-adjust:exact;} .slides-scene{break-after:page;break-inside:avoid;} .slides-scene:last-child{break-after:auto;}`;printed.head.append(meta,style);
      for(const slide of deck.slides)printed.body.append(slidesScene(printed,deck,slide.id));
      const frame=doc.createElement('iframe');frame.className='slides-print';frame.title='Printable presentation';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';frame.srcdoc=`<!doctype html>${printed.documentElement.outerHTML}`;
      return new Promise<void>((resolve,reject)=>{let timer=0,settled=false;const cleanup=()=>{if(settled)return;settled=true;win.clearTimeout(timer);frame.remove();cleanups.delete(cleanup);resolve();};cleanups.add(cleanup);
        frame.onload=()=>{void(async()=>{try{const target=frame.contentWindow,document=frame.contentDocument;if(!target||!document)throw new Error('The print document could not be opened.');await Promise.all([...document.images].map(image=>image.decode()));await document.fonts?.ready;if(disposed||settled)return;target.addEventListener('afterprint',cleanup,{once:true});target.focus();target.print();}catch(cause){if(!settled){settled=true;win.clearTimeout(timer);frame.remove();cleanups.delete(cleanup);reject(cause);}}})();};
        timer=win.setTimeout(cleanup,120000);root.append(frame);
      });
    },
    dispose(){if(disposed)return;disposed=true;closePresentation?.();for(const cleanup of [...cleanups])cleanup();},
  };
}
