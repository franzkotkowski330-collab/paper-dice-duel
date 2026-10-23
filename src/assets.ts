export type Frame = { x: number; y: number; w: number; h: number; cellX: number; cellY: number; clip?: number[][] };
export class Atlas {
  image: HTMLImageElement;
  columns: number;
  rows: number;
  frames: Frame[] = [];
  cellWidth: number;
  cellHeight: number;
  constructor(image: HTMLImageElement, columns: number, rows: number) {
    this.image = image; this.columns = columns; this.rows = rows;
    this.cellWidth = image.naturalWidth / columns; this.cellHeight = image.naturalHeight / rows;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < columns * rows; index++) {
      const cx = Math.round(index % columns * this.cellWidth); const cy = Math.round(Math.floor(index / columns) * this.cellHeight);
      const endX = Math.min(canvas.width, Math.round(cx + this.cellWidth)); const endY = Math.min(canvas.height, Math.round(cy + this.cellHeight));
      let left = endX, right = cx, top = endY, bottom = cy;
      for (let y = cy; y < endY; y += 2) for (let x = cx; x < endX; x += 2) {
        if (rgba[(y * canvas.width + x) * 4 + 3] > 80) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      this.frames.push({ x: Math.max(cx, left - 2), y: Math.max(cy, top - 2), w: Math.max(1, right - left + 5), h: Math.max(1, bottom - top + 5), cellX: cx, cellY: cy });
    }
  }
  draw(context: CanvasRenderingContext2D, index: number, x: number, ground: number, standingHeight: number, alpha = 1): void {
    const frame = this.frames[index] || this.frames[0]; const reference = this.frames[0];
    const scale = standingHeight / reference.h;
    const width = frame.w * scale; const height = frame.h * scale;
    context.save(); context.globalAlpha *= alpha;
    if(frame.clip){context.beginPath();frame.clip.forEach(([px,py],i)=>{
      const dx=x-width/2+(px-frame.x)*scale,dy=ground-height+(py-frame.y)*scale;
      if(i===0)context.moveTo(dx,dy);else context.lineTo(dx,dy);
    });context.closePath();context.clip();}
    context.drawImage(this.image, frame.x, frame.y, frame.w, frame.h, x - width / 2, ground - height, width, height);
    context.restore();
  }
  icon(context: CanvasRenderingContext2D, index: number, x: number, y: number, width: number, height = width): void {
    const frame = this.frames[index]; const scale = Math.min(width / frame.w, height / frame.h);
    const w = frame.w * scale, h = frame.h * scale;
    context.drawImage(this.image, frame.x, frame.y, frame.w, frame.h, x - w / 2, y - h / 2, w, h);
  }
  dataUrl(index: number): string {
    const f = this.frames[index]; const canvas = document.createElement('canvas'); canvas.width = f.w; canvas.height = f.h;
    canvas.getContext('2d')!.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    return canvas.toDataURL('image/png');
  }
}
export type Assets = { background: HTMLImageElement; hero: Atlas; skeleton: Atlas; icons: Atlas; familiar: Atlas; ape?: Atlas; shadow?: Atlas };

async function loadImage(name: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = `${import.meta.env.BASE_URL}assets/${name === 'skeleton' ? 'skeleton-v2' : name}.webp`;
  try { await image.decode(); } catch { throw new Error(`The ${name} paper asset could not load. Please retry.`); }
  return image;
}
export async function loadAssets(onProgress: (number: number) => void, expanded = false): Promise<Assets> {
  const names = ['background', 'hero', 'skeleton', 'icons', 'familiar', ...(expanded ? ['ape', 'shadow'] : [])];
  let done = 0;
  const images = await Promise.all(names.map(async name => { const image = await loadImage(name); onProgress(++done / names.length); return image; }));
  const assets: Assets = {
    background: images[0], hero: new Atlas(images[1], 4, 2), skeleton: new Atlas(images[2], 3, 2),
    icons: new Atlas(images[3], 5, 3), familiar: new Atlas(images[4], 3, 3),
  };
  assets.skeleton.frames = [[60,10,405,518],[520,10,470,519],[993,84,535,445],
    [59,551,444,433],[538,616,447,369],[1020,778,508,214]]
    .map(([x,y,w,h]) => ({ x,y,w,h,cellX:x,cellY:y }));
  // This generated sheet has individually spaced lower-row controls; preserve
  // their actual cut edges rather than treating them as uniform grid cells.
  const iconBounds = [[66,15,222,312],[384,15,219,312],[699,15,219,312],[1011,15,222,312],[1329,15,222,315],
    [69,339,219,306],[387,342,219,306],[699,342,219,306],[1014,342,219,309],[1269,456,339,138],
    [81,669,249,285],[387,684,204,252],[633,696,231,231],[918,708,210,210],[1173,744,402,150]];
  assets.icons.frames = iconBounds.map(([x,y,w,h]) => ({ x: x-6, y: y-6, w: w+12, h: h+12, cellX: x-6, cellY: y-6 }));
  if (expanded) {
    assets.ape = new Atlas(images[5], 3, 2); assets.shadow = new Atlas(images[6], 3, 2);
    assets.ape.frames=[[38,126,462,350],[547,25,415,453],[919,146,607,329],[66,548,472,402],[546,651,458,300],[1010,775,510,191]]
      .map(([x,y,w,h])=>({x,y,w,h,cellX:x,cellY:y}));
    assets.ape.frames[1].clip=[[547,25],[915,25],[915,335],[962,335],[962,478],[547,478]];
    assets.ape.frames[2].clip=[[919,146],[1526,146],[1526,475],[1050,475],[1050,330],[919,330]];
    assets.shadow.frames=[[62,48,410,465],[535,35,460,478],[938,107,580,405],[56,547,447,424],[536,616,455,346],[1007,773,493,196]]
      .map(([x,y,w,h])=>({x,y,w,h,cellX:x,cellY:y}));
    assets.shadow.frames[1].clip=[[535,35],[925,35],[925,318],[995,318],[995,513],[535,513]];
    assets.shadow.frames[2].clip=[[938,107],[1518,107],[1518,512],[995,512],[995,367],[938,367]];
  }
  return assets;
}
