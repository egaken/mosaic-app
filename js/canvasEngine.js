/**
 * canvasEngine.js (v2.1)
 * 単一高精細Canvas（Retina対応）描画エンジン
 * モザイク・すりガラス風ブラー・目線バー・絵文字スタンプ・逆モザイク（背景ぼかし）・比較機能
 */

(function (global) {
  class CanvasEngine {
    constructor(canvas, viewport) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.viewport = viewport;

      this.image = null; // HTMLImageElement
      this.dpr = window.devicePixelRatio || 1;
      this.baseHandleRadius = 6;
    }

    setImage(img) {
      this.image = img;
    }

    resize() {
      this.dpr = window.devicePixelRatio || 1;
      const rect = this.viewport.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      if (this.canvas.width !== w * this.dpr || this.canvas.height !== h * this.dpr) {
        this.canvas.width = w * this.dpr;
        this.canvas.height = h * this.dpr;
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
      }
    }

    /**
     * メイン描画ループ
     * @param {Object} viewportParams { scale, panX, panY }
     * @param {Array} objects 確定済み加工オブジェクト群
     * @param {Object|null} selectedObject 選択中オブジェクト
     * @param {Object|null} previewObject ドラッグ作成中プレビュー
     * @param {Object} options { isComparing, bgBlur: { enabled, intensity } }
     */
    render(viewportParams, objects, selectedObject, previewObject, options = {}) {
      const { scale, panX, panY } = viewportParams;
      const { isComparing = false, bgBlur = { enabled: false, intensity: 16 } } = options;
      const ctx = this.ctx;

      // 画面クリア
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (!this.image) return;

      const imgW = this.image.naturalWidth;
      const imgH = this.image.naturalHeight;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // (A) 画像カードのドロップシャドウと背景白紙
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
      ctx.shadowBlur = 24 / scale;
      ctx.shadowOffsetY = 8 / scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, imgW, imgH);
      ctx.restore();

      // (B) 比較中モードの場合は、元画像のみを描画して即座に終了
      if (isComparing) {
        ctx.drawImage(this.image, 0, 0, imgW, imgH);
        ctx.restore();
        return;
      }

      // (C) 逆モザイク（背景ぼかし）が有効な場合
      if (bgBlur.enabled) {
        this.renderBackgroundBlur(ctx, this.image, objects, bgBlur.intensity);
      } else {
        // 通常の背景元画像
        ctx.drawImage(this.image, 0, 0, imgW, imgH);
      }

      // (D) 確定済みオブジェクトの描画
      for (const obj of objects) {
        this.renderObject(ctx, this.image, obj);
      }

      // (E) ドラッグ中プレビュー（下地が見える半透明＋点線枠）
      if (previewObject) {
        this.renderPreview(ctx, previewObject, scale);
      }

      // (F) 選択中オブジェクトのバウンディングボックス＆8方向ハンドル
      if (selectedObject) {
        this.renderSelection(ctx, selectedObject, scale);
      }

      ctx.restore();
    }

    /**
     * 逆モザイク（背景全体をぼかして主役領域だけをクリアに保つ処理）
     */
    renderBackgroundBlur(ctx, imageSource, objects, blurIntensity = 16) {
      const w = imageSource.naturalWidth;
      const h = imageSource.naturalHeight;
      const radius = Math.max(4, Math.round(blurIntensity));

      // 1. 全面にブラーをかけた画像を描画
      ctx.save();
      ctx.filter = `blur(${radius}px)`;
      // 端の透け防止のため少し大きく描画
      ctx.drawImage(imageSource, -radius, -radius, w + radius * 2, h + radius * 2);
      ctx.restore();

      // 2. もしオブジェクトが存在すれば、それらの領域をくり抜いて鮮明な元画像を重ねる
      // （※スタンプや目線バー以外の矩形・円形・フリーハンドを主役窓として扱う）
      const focusObjects = objects.filter(o => o.style !== 'stamp' && o.style !== 'fill-black' && o.style !== 'fill-white');

      if (focusObjects.length > 0) {
        ctx.save();
        ctx.beginPath();

        for (const obj of focusObjects) {
          const norm = this.normalizeRect(obj.x, obj.y, obj.width, obj.height);
          if (obj.shape === 'rect') {
            ctx.rect(norm.x, norm.y, norm.width, norm.height);
          } else if (obj.shape === 'ellipse') {
            ctx.ellipse(
              norm.x + norm.width / 2,
              norm.y + norm.height / 2,
              norm.width / 2,
              norm.height / 2,
              0, 0, Math.PI * 2
            );
          } else if (obj.shape === 'freehand' && obj.points?.length > 0) {
            // パス
            ctx.rect(norm.x, norm.y, norm.width, norm.height);
          }
        }

        ctx.clip(); // 主役領域でクリッピング
        ctx.drawImage(imageSource, 0, 0, w, h); // 鮮明な元画像を描画
        ctx.restore();
      }
    }

    /**
     * 単一加工オブジェクトを描画
     */
    renderObject(ctx, imageSource, obj) {
      const norm = this.normalizeRect(obj.x, obj.y, obj.width, obj.height);
      if (norm.width <= 0 || norm.height <= 0) return;

      if (obj.style === 'stamp') {
        this.renderStamp(ctx, obj, norm);
      } else if (obj.style === 'fill' || obj.style === 'fill-black' || obj.style === 'fill-white') {
        this.renderFill(ctx, obj, norm);
      } else if (obj.style === 'mosaic') {
        this.renderMosaic(ctx, imageSource, obj, norm);
      } else if (obj.style === 'blur') {
        this.renderBlur(ctx, imageSource, obj, norm);
      }
    }

    /**
     * 絵文字スタンプの描画
     */
    renderStamp(ctx, obj, norm) {
      ctx.save();
      const emoji = obj.emoji || '😎';
      const size = Math.min(norm.width, norm.height) * 0.9;
      const cx = norm.x + norm.width / 2;
      const cy = norm.y + norm.height / 2;

      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, cx, cy);

      ctx.restore();
    }

    /**
     * 単色塗りつぶし（黒塗り・白塗り目線バー）
     */
    renderFill(ctx, obj, norm) {
      ctx.save();
      const color = obj.fillColor || (obj.style === 'fill-white' ? '#ffffff' : '#000000');
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      if (obj.shape === 'rect') {
        ctx.fillRect(norm.x, norm.y, norm.width, norm.height);
      } else if (obj.shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
          norm.x + norm.width / 2,
          norm.y + norm.height / 2,
          norm.width / 2,
          norm.height / 2,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      } else if (obj.shape === 'freehand' && obj.points && obj.points.length > 0) {
        ctx.lineWidth = obj.brushSize || 24;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < obj.points.length; i++) {
          const p = obj.points[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    /**
     * モザイク処理（タイリング）
     */
    renderMosaic(ctx, imageSource, obj, norm) {
      const tileSize = Math.max(2, Math.round(obj.intensity || 16));

      const smallW = Math.max(1, Math.floor(norm.width / tileSize));
      const smallH = Math.max(1, Math.floor(norm.height / tileSize));
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = smallW;
      smallCanvas.height = smallH;
      const smallCtx = smallCanvas.getContext('2d');

      smallCtx.drawImage(
        imageSource,
        norm.x, norm.y, norm.width, norm.height,
        0, 0, smallW, smallH
      );

      const offCanvas = document.createElement('canvas');
      offCanvas.width = norm.width;
      offCanvas.height = norm.height;
      const offCtx = offCanvas.getContext('2d');
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(smallCanvas, 0, 0, smallW, smallH, 0, 0, norm.width, norm.height);

      this.applyShapeMask(offCtx, obj, norm);
      ctx.drawImage(offCanvas, norm.x, norm.y);
    }

    /**
     * ぼかし処理（すりガラス風ブラー）
     */
    renderBlur(ctx, imageSource, obj, norm) {
      const blurRadius = Math.max(2, Math.round(obj.intensity || 12));
      const pad = blurRadius * 2;
      const sx = Math.max(0, norm.x - pad);
      const sy = Math.max(0, norm.y - pad);
      const sw = Math.min(imageSource.naturalWidth - sx, norm.width + pad * 2);
      const sh = Math.min(imageSource.naturalHeight - sy, norm.height + pad * 2);

      const offCanvas = document.createElement('canvas');
      offCanvas.width = norm.width;
      offCanvas.height = norm.height;
      const offCtx = offCanvas.getContext('2d');

      offCtx.filter = `blur(${blurRadius}px)`;
      offCtx.drawImage(
        imageSource,
        sx, sy, sw, sh,
        sx - norm.x, sy - norm.y, sw, sh
      );
      offCtx.filter = 'none';

      this.applyShapeMask(offCtx, obj, norm);
      ctx.drawImage(offCanvas, norm.x, norm.y);
    }

    applyShapeMask(offCtx, obj, norm) {
      if (obj.shape === 'rect') return;

      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-in';
      offCtx.beginPath();

      if (obj.shape === 'ellipse') {
        const cx = norm.width / 2;
        const cy = norm.height / 2;
        const rx = Math.max(1, norm.width / 2);
        const ry = Math.max(1, norm.height / 2);
        offCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        offCtx.fill();
      } else if (obj.shape === 'freehand' && obj.points && obj.points.length > 0) {
        offCtx.lineWidth = obj.brushSize || 24;
        offCtx.lineCap = 'round';
        offCtx.lineJoin = 'round';
        for (let i = 0; i < obj.points.length; i++) {
          const p = obj.points[i];
          const px = p.x - norm.x;
          const py = p.y - norm.y;
          if (i === 0) offCtx.moveTo(px, py);
          else offCtx.lineTo(px, py);
        }
        offCtx.stroke();
      }

      offCtx.restore();
    }

    /**
     * ドラッグ作成中プレビュー
     */
    renderPreview(ctx, preview, scale) {
      const norm = this.normalizeRect(preview.x, preview.y, preview.width, preview.height);
      const lineWidth = 2 / scale;
      const dash = [5 / scale, 4 / scale];

      ctx.save();

      if (preview.style === 'stamp') {
        // スタンププレビュー
        const emoji = preview.emoji || '😎';
        const size = Math.min(norm.width, norm.height) * 0.9;
        const cx = norm.x + norm.width / 2;
        const cy = norm.y + norm.height / 2;

        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.strokeRect(norm.x, norm.y, norm.width, norm.height);

        ctx.globalAlpha = 0.7;
        ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, cx, cy);
      } else {
        // 通常の半透明プレビュー
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';

        if (preview.shape === 'rect') {
          ctx.fillRect(norm.x, norm.y, norm.width, norm.height);
          ctx.strokeRect(norm.x, norm.y, norm.width, norm.height);
        } else if (preview.shape === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(
            norm.x + norm.width / 2,
            norm.y + norm.height / 2,
            norm.width / 2,
            norm.height / 2,
            0, 0, Math.PI * 2
          );
          ctx.fill();
          ctx.stroke();
        } else if (preview.shape === 'freehand' && preview.points && preview.points.length > 0) {
          ctx.lineWidth = (preview.brushSize || 24);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
          ctx.setLineDash([]);
          ctx.beginPath();
          for (let i = 0; i < preview.points.length; i++) {
            const p = preview.points[i];
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    /**
     * 選択枠＆8方向ハンドル描画
     */
    renderSelection(ctx, obj, scale) {
      const norm = this.normalizeRect(obj.x, obj.y, obj.width, obj.height);
      const effectiveRadius = this.baseHandleRadius / scale;
      const lineWidth = 1.5 / scale;
      const dash = [4 / scale, 4 / scale];

      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.strokeRect(norm.x, norm.y, norm.width, norm.height);

      const handles = this.getHandles(norm);
      ctx.setLineDash([]);

      for (const h of handles) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = lineWidth * 1.5;

        ctx.beginPath();
        ctx.arc(h.x, h.y, effectiveRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    getHandles(norm) {
      const { x, y, width: w, height: h } = norm;
      const mx = x + w / 2;
      const my = y + h / 2;

      return [
        { id: 'nw', x: x, y: y, cursor: 'nwse-resize' },
        { id: 'n',  x: mx, y: y, cursor: 'ns-resize' },
        { id: 'ne', x: x + w, y: y, cursor: 'nesw-resize' },
        { id: 'e',  x: x + w, y: my, cursor: 'ew-resize' },
        { id: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
        { id: 's',  x: mx, y: y + h, cursor: 'ns-resize' },
        { id: 'sw', x: x, y: y + h, cursor: 'nesw-resize' },
        { id: 'w',  x: x, y: my, cursor: 'ew-resize' },
      ];
    }

    getHandleAt(obj, px, py, scale) {
      if (!obj) return null;
      const norm = this.normalizeRect(obj.x, obj.y, obj.width, obj.height);
      const handles = this.getHandles(norm);
      const hitRadius = (this.baseHandleRadius + 4) / scale;

      for (const h of handles) {
        const dist = Math.hypot(h.x - px, h.y - py);
        if (dist <= hitRadius) return h;
      }
      return null;
    }

    hitTest(objects, px, py) {
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        const norm = this.normalizeRect(obj.x, obj.y, obj.width, obj.height);

        if (obj.shape === 'rect' || obj.shape === 'freehand' || obj.style === 'stamp') {
          if (px >= norm.x && px <= norm.x + norm.width && py >= norm.y && py <= norm.y + norm.height) {
            return obj;
          }
        } else if (obj.shape === 'ellipse') {
          const cx = norm.x + norm.width / 2;
          const cy = norm.y + norm.height / 2;
          const rx = norm.width / 2;
          const ry = norm.height / 2;
          if (rx > 0 && ry > 0) {
            const dx = (px - cx) / rx;
            const dy = (py - cy) / ry;
            if (dx * dx + dy * dy <= 1) return obj;
          }
        }
      }
      return null;
    }

    normalizeRect(x, y, w, h) {
      let nx = x, ny = y, nw = w, nh = h;
      if (nw < 0) { nx += nw; nw = Math.abs(nw); }
      if (nh < 0) { ny += nh; nh = Math.abs(nh); }
      return { x: nx, y: ny, width: nw, height: nh };
    }

    /**
     * 画像保存エクスポート（JPEG時は横幅1200px・アスペクト比維持、PNG時は等倍解像度）
     */
    exportImage(objects, options = {}, format = 'png', quality = 0.92) {
      if (!this.image) return null;

      const { bgBlur = { enabled: false, intensity: 16 }, targetWidth = null } = options;
      const origW = this.image.naturalWidth;
      const origH = this.image.naturalHeight;

      // JPEGの場合は横幅1200px（指定があればその値）にリサイズ、縦横比は維持
      let outW = origW;
      let outH = origH;

      if (targetWidth || format === 'jpeg') {
        outW = targetWidth || 1200;
        outH = Math.round(outW * (origH / origW));
      }

      const expCanvas = document.createElement('canvas');
      expCanvas.width = outW;
      expCanvas.height = outH;
      const expCtx = expCanvas.getContext('2d');

      // JPEGは透過非対応のため下地を白(#ffffff)で塗りつぶす
      if (format === 'jpeg') {
        expCtx.fillStyle = '#ffffff';
        expCtx.fillRect(0, 0, outW, outH);
      }

      // 目標解像度へのスケーリング比率
      const scale = outW / origW;
      expCtx.save();
      expCtx.scale(scale, scale);

      // 背景元画像（または逆モザイク背景ぼかし）
      if (bgBlur.enabled) {
        this.renderBackgroundBlur(expCtx, this.image, objects, bgBlur.intensity);
      } else {
        expCtx.drawImage(this.image, 0, 0);
      }

      // 全加工オブジェクトの描画
      for (const obj of objects) {
        this.renderObject(expCtx, this.image, obj);
      }

      expCtx.restore();

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      return expCanvas.toDataURL(mimeType, quality);
    }
  }

  global.CanvasEngine = CanvasEngine;
})(window);
