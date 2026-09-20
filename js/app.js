/**
 * app.js (v2.1)
 * アプリケーション全体のオーケストレーション
 * イベントリスナー、UI状態、ズーム＆パン、絵文字スタンプ、逆モザイク、ビフォーアフター比較
 */

(function (global) {
  const HistoryManager = global.HistoryManager;
  const CanvasEngine = global.CanvasEngine;

  class MosaicApp {
    constructor() {
      this.initElements();

      this.engine = new CanvasEngine(this.canvas, this.viewport);
      this.history = new HistoryManager((state) => this.updateHistoryButtons(state));

      // アプリケーション状態
      this.objects = [];
      this.selectedObjectId = null;
      this.activeTool = 'select'; // 'select' | 'rect' | 'ellipse' | 'freehand' | 'pan'
      this.activeStyle = 'mosaic'; // 'mosaic' | 'blur' | 'stamp' | 'fill-black' | 'fill-white'
      this.selectedEmoji = '😎'; // 選択中スタンプ絵文字

      // 逆モザイク（背景ぼかし）設定
      this.bgBlur = {
        enabled: false,
        intensity: 16,
      };

      // 比較モード状態
      this.isComparing = false;

      // パラメータ
      this.mosaicIntensity = 16;
      this.blurIntensity = 12;
      this.brushSize = 24;

      // ビューポート（ズーム＆パン）
      this.scale = 1.0;
      this.panX = 0;
      this.panY = 0;

      // インタラクション操作状態
      this.interaction = {
        mode: 'idle', // 'idle' | 'drawing' | 'moving' | 'resizing' | 'panning'
        startX: 0,
        startY: 0,
        screenStartX: 0,
        screenStartY: 0,
        panStartX: 0,
        panStartY: 0,
        resizeHandle: null,
        draggedSnapshot: null,
        previewObject: null,
      };

      this.isSpacePressed = false;
      this.imageFileName = 'edited_image';

      this.bindEvents();

      // ウィンドウサイズ初期化＆自動サンプル画像ロード
      this.engine.resize();
      this.loadDefaultSample();
    }

    initElements() {
      this.viewport = document.getElementById('viewport');
      this.canvas = document.getElementById('canvas');
      this.dropOverlay = document.getElementById('drop-overlay');
      this.comparingBadge = document.getElementById('comparing-badge');

      // ヘッダー要素
      this.btnUndo = document.getElementById('btn-undo');
      this.btnRedo = document.getElementById('btn-redo');
      this.btnCompare = document.getElementById('btn-compare');
      this.fileInput = document.getElementById('file-input');
      this.btnSample = document.getElementById('btn-sample');
      this.btnSaveMain = document.getElementById('btn-save-main');
      this.btnSaveDropdown = document.getElementById('btn-save-dropdown');
      this.saveMenu = document.getElementById('save-menu');

      // ツールバー
      this.toolButtons = document.querySelectorAll('.tool-btn');

      // プロパティサイドバー
      this.styleCards = document.querySelectorAll('.style-card');
      this.emojiSection = document.getElementById('emoji-palette-section');
      this.emojiButtons = document.querySelectorAll('.emoji-btn');
      this.activeEmojiPreview = document.getElementById('active-emoji-preview');

      // 逆モザイクUI
      this.switchBgBlur = document.getElementById('switch-bg-blur');
      this.bgBlurSliderWrap = document.getElementById('bg-blur-slider-wrap');
      this.sliderBgBlur = document.getElementById('slider-bg-blur');
      this.labelBgBlur = document.getElementById('label-bg-blur');

      // スライダー
      this.sliderMosaic = document.getElementById('slider-mosaic');
      this.sliderBlur = document.getElementById('slider-blur');
      this.sliderBrush = document.getElementById('slider-brush');
      this.labelMosaic = document.getElementById('label-mosaic');
      this.labelBlur = document.getElementById('label-blur');
      this.labelBrush = document.getElementById('label-brush');
      this.rowMosaic = document.getElementById('row-mosaic');
      this.rowBlur = document.getElementById('row-blur');
      this.rowBrush = document.getElementById('row-brush');
      this.selectionPanel = document.getElementById('selection-panel');
      this.selectionBadge = document.getElementById('selection-status-badge');
      this.btnDelete = document.getElementById('btn-delete');

      // ズームバー
      this.btnZoomIn = document.getElementById('btn-zoom-in');
      this.btnZoomOut = document.getElementById('btn-zoom-out');
      this.btnZoomFit = document.getElementById('btn-zoom-fit');
      this.btnZoom100 = document.getElementById('btn-zoom-100');
      this.zoomIndicator = document.getElementById('zoom-indicator');
    }

    bindEvents() {
      // リサイズ
      window.addEventListener('resize', () => {
        this.engine.resize();
        this.render();
      });

      // ツールバー
      this.toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.setActiveTool(btn.dataset.tool);
        });
      });

      // スタイル選択
      this.styleCards.forEach(card => {
        card.addEventListener('click', () => {
          this.setActiveStyle(card.dataset.style);
        });
      });

      // 絵文字パレット選択
      this.emojiButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.emojiButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedEmoji = btn.dataset.emoji;
          this.activeEmojiPreview.textContent = this.selectedEmoji;

          // 選択中のオブジェクトがあれば絵文字を変更
          if (this.selectedObjectId) {
            this.updateSelectedProps({ emoji: this.selectedEmoji });
          }
        });
      });

      // 逆モザイク（背景ぼかし）トグル
      this.switchBgBlur.addEventListener('change', (e) => {
        this.bgBlur.enabled = e.target.checked;
        this.bgBlurSliderWrap.style.display = this.bgBlur.enabled ? 'flex' : 'none';
        this.render();
      });

      this.sliderBgBlur.addEventListener('input', (e) => {
        this.bgBlur.intensity = Number(e.target.value);
        this.labelBgBlur.textContent = `${this.bgBlur.intensity} px`;
        this.render();
      });

      // スライダー
      this.sliderMosaic.addEventListener('input', (e) => {
        this.mosaicIntensity = Number(e.target.value);
        this.labelMosaic.textContent = `${this.mosaicIntensity} px`;
        this.updateSelectedProps({ intensity: this.mosaicIntensity });
      });

      this.sliderBlur.addEventListener('input', (e) => {
        this.blurIntensity = Number(e.target.value);
        this.labelBlur.textContent = `${this.blurIntensity} px`;
        this.updateSelectedProps({ intensity: this.blurIntensity });
      });

      this.sliderBrush.addEventListener('input', (e) => {
        this.brushSize = Number(e.target.value);
        this.labelBrush.textContent = `${this.brushSize} px`;
        this.updateSelectedProps({ brushSize: this.brushSize });
      });

      // 選択中オブジェクトの削除
      this.btnDelete.addEventListener('click', () => {
        this.deleteSelected();
      });

      // Undo / Redo
      this.btnUndo.addEventListener('click', () => this.handleUndo());
      this.btnRedo.addEventListener('click', () => this.handleRedo());

      // 比較ボタン（長押し）
      const startComparing = () => {
        this.isComparing = true;
        this.btnCompare.classList.add('active');
        this.comparingBadge.style.display = 'flex';
        this.render();
      };

      const stopComparing = () => {
        if (!this.isComparing) return;
        this.isComparing = false;
        this.btnCompare.classList.remove('active');
        this.comparingBadge.style.display = 'none';
        this.render();
      };

      this.btnCompare.addEventListener('mousedown', startComparing);
      this.btnCompare.addEventListener('mouseup', stopComparing);
      this.btnCompare.addEventListener('mouseleave', stopComparing);
      this.btnCompare.addEventListener('touchstart', (e) => { e.preventDefault(); startComparing(); });
      this.btnCompare.addEventListener('touchend', stopComparing);

      // 画像読み込み
      this.fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.loadFile(file);
          e.target.value = '';
        }
      });

      this.btnSample.addEventListener('click', () => {
        this.loadDefaultSample();
      });

      // ドラッグ＆ドロップ
      window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        this.dropOverlay.classList.add('active');
      });
      window.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) {
          this.dropOverlay.classList.remove('active');
        }
      });
      window.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropOverlay.classList.remove('active');
        if (e.dataTransfer?.files?.[0]) {
          this.loadFile(e.dataTransfer.files[0]);
        }
      });

      // クリップボード貼り付け
      window.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.includes('image')) {
            const file = item.getAsFile();
            if (file) this.loadFile(file);
            break;
          }
        }
      });

      // 保存メニュー
      this.btnSaveMain.addEventListener('click', () => this.handleSave('png'));
      this.btnSaveDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveMenu.classList.toggle('show');
      });
      document.addEventListener('click', () => this.saveMenu.classList.remove('show'));

      document.querySelectorAll('.popover-item').forEach(item => {
        item.addEventListener('click', () => {
          this.handleSave(item.dataset.format);
        });
      });

      // マウス操作（キャンバス上）
      this.viewport.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
      this.viewport.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

      // ズーム（ホイール）
      this.viewport.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

      // ズームバーボタン
      this.btnZoomIn.addEventListener('click', () => this.zoom(1.25));
      this.btnZoomOut.addEventListener('click', () => this.zoom(0.8));
      this.btnZoomFit.addEventListener('click', () => this.fitToScreen(true));
      this.btnZoom100.addEventListener('click', () => this.zoom100(true));

      // キーボードショートカット
      window.addEventListener('keydown', (e) => this.handleKeyDown(e));
      window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    // ==========================================
    // ツール・スタイル切り替え
    // ==========================================
    setActiveTool(tool) {
      this.activeTool = tool;
      this.toolButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
      });

      if (tool !== 'select') {
        this.setSelectedId(null);
      }
      this.updateCursor();
    }

    setActiveStyle(style) {
      this.activeStyle = style;
      this.styleCards.forEach(card => {
        card.classList.toggle('active', card.dataset.style === style);
      });

      const isMosaic = style === 'mosaic';
      const isBlur = style === 'blur';
      const isStamp = style === 'stamp';

      this.rowMosaic.style.display = isMosaic ? 'flex' : 'none';
      this.rowBlur.style.display = isBlur ? 'flex' : 'none';
      this.emojiSection.style.display = isStamp ? 'flex' : 'none';

      // 選択中オブジェクトがあればスタイルを即座に変更
      if (this.selectedObjectId) {
        this.updateSelectedProps(this.getStyleProps(style));
      }
    }

    getStyleProps(style) {
      if (style === 'mosaic') {
        return { style: 'mosaic', intensity: this.mosaicIntensity };
      } else if (style === 'blur') {
        return { style: 'blur', intensity: this.blurIntensity };
      } else if (style === 'stamp') {
        return { style: 'stamp', emoji: this.selectedEmoji };
      } else if (style === 'fill-black') {
        return { style: 'fill-black', fillColor: '#000000' };
      } else if (style === 'fill-white') {
        return { style: 'fill-white', fillColor: '#ffffff' };
      }
      return {};
    }

    // ==========================================
    // 画像ロード
    // ==========================================
    loadFile(file) {
      if (!file.type.startsWith('image/')) return;
      this.imageFileName = file.name.replace(/\.[^/.]+$/, '');
      const reader = new FileReader();
      reader.onload = (e) => {
        this.loadImageFromDataUrl(e.target.result);
      };
      reader.readAsDataURL(file);
    }

    loadImageFromDataUrl(dataUrl) {
      const img = new Image();
      img.onload = () => {
        this.engine.setImage(img);
        this.objects = [];
        this.setSelectedId(null);
        this.history.clear();
        this.fitToScreen();
      };
      img.src = dataUrl;
    }

    /**
     * サンプル画像を自動生成してロード（初回起動時）
     */
    loadDefaultSample() {
      const w = 840;
      const h = 540;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#f8fafc');
      bgGrad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#cbd5e1';
      for (let x = 20; x < w; x += 32) {
        for (let y = 20; y < h; y += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff';
      this.drawRoundedRect(ctx, 60, 50, 720, 440, 16);
      ctx.fill();
      ctx.restore();

      const hGrad = ctx.createLinearGradient(60, 50, 780, 50);
      hGrad.addColorStop(0, '#1e293b');
      hGrad.addColorStop(1, '#334155');
      ctx.fillStyle = hGrad;
      this.drawRoundedRectTop(ctx, 60, 50, 720, 84, 16);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('SAMPLE IDENTITY CARD / サンプル身分証', 94, 102);

      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      this.drawRoundedRect(ctx, 100, 175, 170, 210, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(185, 245, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(185, 360, 65, Math.PI, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('氏名 / NAME', 310, 205);
      ctx.fillText('生年月日 / DATE OF BIRTH', 310, 275);
      ctx.fillText('社員番号 / EMPLOYEE ID', 310, 345);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('山田 太郎 (Yamada Taro)', 310, 235);
      ctx.fillText('1992年 05月 20日', 310, 305);
      ctx.fillText('EMP-2026-9874', 310, 375);

      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('👈 顔写真や氏名・番号をドラッグして、モザイクや目線・スタンプを試せます', 310, 430);

      this.imageFileName = 'sample_card';
      this.loadImageFromDataUrl(c.toDataURL('image/png'));
    }

    drawRoundedRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    drawRoundedRectTop(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // ==========================================
    // ズーム＆パン操作 & スムーズアニメーション
    // ==========================================
    animateViewport(targetScale, targetPanX, targetPanY, duration = 260) {
      if (this.animatingFrame) {
        cancelAnimationFrame(this.animatingFrame);
        this.animatingFrame = null;
      }

      const startScale = this.scale;
      const startPanX = this.panX;
      const startPanY = this.panY;
      const startTime = performance.now();

      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        // イーズアウト（吸い付くように減速: easeOutCubic）
        const ease = 1 - Math.pow(1 - progress, 3);

        this.scale = startScale + (targetScale - startScale) * ease;
        this.panX = startPanX + (targetPanX - startPanX) * ease;
        this.panY = startPanY + (targetPanY - startPanY) * ease;

        this.updateZoomDisplay();
        this.render();

        if (progress < 1.0) {
          this.animatingFrame = requestAnimationFrame(step);
        } else {
          this.animatingFrame = null;
        }
      };

      this.animatingFrame = requestAnimationFrame(step);
    }

    /**
     * 画像が画面外へ完全に消え去るのを防ぐガード（境界リミット）
     */
    clampPan(panX, panY, scale) {
      if (!this.engine.image) return { panX, panY };
      const vpRect = this.viewport.getBoundingClientRect();
      const imgW = this.engine.image.naturalWidth * scale;
      const imgH = this.engine.image.naturalHeight * scale;
      const minVisible = 80; // 画面内に最低限残るピクセル数

      const minPanX = minVisible - imgW;
      const maxPanX = vpRect.width - minVisible;
      const minPanY = minVisible - imgH;
      const maxPanY = vpRect.height - minVisible;

      return {
        panX: Math.min(Math.max(panX, minPanX), maxPanX),
        panY: Math.min(Math.max(panY, minPanY), maxPanY),
      };
    }

    /**
     * 画面中央にぴったりフィット（余白を考慮した快適な配置）
     */
    fitToScreen(animate = false) {
      if (!this.engine.image) return;
      this.engine.resize();
      const vpRect = this.viewport.getBoundingClientRect();

      // 左側ツールバー（幅56px + 左20px）と右下ズームバーを考慮した快適な作業領域
      const padLeft = 84;
      const padRight = 36;
      const padTop = 40;
      const padBottom = 60;

      const availW = Math.max(100, vpRect.width - (padLeft + padRight));
      const availH = Math.max(100, vpRect.height - (padTop + padBottom));

      const imgW = this.engine.image.naturalWidth;
      const imgH = this.engine.image.naturalHeight;

      const targetScale = Math.min(availW / imgW, availH / imgH, 1.0);
      const targetPanX = padLeft + (availW - imgW * targetScale) / 2;
      const targetPanY = padTop + (availH - imgH * targetScale) / 2;

      if (animate) {
        this.animateViewport(targetScale, targetPanX, targetPanY, 260);
      } else {
        this.scale = targetScale;
        this.panX = targetPanX;
        this.panY = targetPanY;
        this.updateZoomDisplay();
        this.render();
      }
    }

    zoom100(animate = true) {
      if (!this.engine.image) return;
      const vpRect = this.viewport.getBoundingClientRect();
      const imgW = this.engine.image.naturalWidth;
      const imgH = this.engine.image.naturalHeight;

      const targetScale = 1.0;
      const padLeft = 84;
      const padRight = 36;
      const availW = Math.max(100, vpRect.width - (padLeft + padRight));
      const targetPanX = padLeft + (availW - imgW) / 2;
      const targetPanY = (vpRect.height - imgH) / 2;

      if (animate) {
        this.animateViewport(targetScale, targetPanX, targetPanY, 240);
      } else {
        this.scale = targetScale;
        this.panX = targetPanX;
        this.panY = targetPanY;
        this.updateZoomDisplay();
        this.render();
      }
    }

    zoom(factor, mouseScreenX = null, mouseScreenY = null) {
      if (!this.engine.image) return;
      const oldScale = this.scale;
      let newScale = Math.min(Math.max(0.15, oldScale * factor), 10.0);

      if (Math.abs(newScale - 1.0) < 0.04 && Math.abs(oldScale - 1.0) > 0.04) {
        newScale = 1.0;
      }

      const vpRect = this.viewport.getBoundingClientRect();
      const cx = mouseScreenX ?? vpRect.width / 2;
      const cy = mouseScreenY ?? vpRect.height / 2;

      let panX = cx - (cx - this.panX) * (newScale / oldScale);
      let panY = cy - (cy - this.panY) * (newScale / oldScale);

      // 移動限界ブレーキ
      const clamped = this.clampPan(panX, panY, newScale);
      this.panX = clamped.panX;
      this.panY = clamped.panY;
      this.scale = newScale;

      this.updateZoomDisplay();
      this.render();
    }

    handleWheel(e) {
      e.preventDefault();
      const vpRect = this.viewport.getBoundingClientRect();
      const mx = e.clientX - vpRect.left;
      const my = e.clientY - vpRect.top;
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      this.zoom(factor, mx, my);
    }

    updateZoomDisplay() {
      this.zoomIndicator.textContent = `${Math.round(this.scale * 100)}%`;
    }

    screenToImageCoords(clientX, clientY) {
      const vpRect = this.viewport.getBoundingClientRect();
      const sx = clientX - vpRect.left;
      const sy = clientY - vpRect.top;
      return {
        x: (sx - this.panX) / this.scale,
        y: (sy - this.panY) / this.scale,
      };
    }

    // ==========================================
    // マウス・ポインタ インタラクション
    // ==========================================
    handleMouseDown(e) {
      if (!this.engine.image || this.isComparing) return;

      if (e.button === 1 || this.isSpacePressed || this.activeTool === 'pan') {
        this.interaction.mode = 'panning';
        this.interaction.screenStartX = e.clientX;
        this.interaction.screenStartY = e.clientY;
        this.interaction.panStartX = this.panX;
        this.interaction.panStartY = this.panY;
        this.viewport.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;

      const p = this.screenToImageCoords(e.clientX, e.clientY);
      this.interaction.startX = p.x;
      this.interaction.startY = p.y;

      if (this.activeTool === 'select') {
        const selected = this.getSelected();

        // 1. ハンドル判定
        if (selected) {
          const handle = this.engine.getHandleAt(selected, p.x, p.y, this.scale);
          if (handle) {
            this.interaction.mode = 'resizing';
            this.interaction.resizeHandle = handle;
            this.interaction.draggedSnapshot = JSON.parse(JSON.stringify(selected));
            return;
          }
        }

        // 2. オブジェクト判定
        const hit = this.engine.hitTest(this.objects, p.x, p.y);
        if (hit) {
          this.setSelectedId(hit.id);
          this.interaction.mode = 'moving';
          this.interaction.draggedSnapshot = JSON.parse(JSON.stringify(hit));
          this.viewport.style.cursor = 'move';
        } else {
          this.setSelectedId(null);
        }
      } else if (['rect', 'ellipse', 'freehand'].includes(this.activeTool)) {
        // 新規図形ドラッグ開始
        this.interaction.mode = 'drawing';
        const styleProps = this.getStyleProps(this.activeStyle);

        this.interaction.previewObject = {
          id: 'preview_' + Date.now(),
          shape: this.activeTool,
          ...styleProps,
          brushSize: this.brushSize,
          x: p.x,
          y: p.y,
          width: 0,
          height: 0,
          points: this.activeTool === 'freehand' ? [{ x: p.x, y: p.y }] : undefined,
        };

        this.render();
      }
    }

    handleMouseMove(e) {
      if (!this.engine.image || this.isComparing) return;

      if (this.interaction.mode === 'panning') {
        const dx = e.clientX - this.interaction.screenStartX;
        const dy = e.clientY - this.interaction.screenStartY;
        const clamped = this.clampPan(
          this.interaction.panStartX + dx,
          this.interaction.panStartY + dy,
          this.scale
        );
        this.panX = clamped.panX;
        this.panY = clamped.panY;
        this.render();
        return;
      }

      const p = this.screenToImageCoords(e.clientX, e.clientY);

      if (this.interaction.mode === 'drawing') {
        const prev = this.interaction.previewObject;
        if (!prev) return;

        if (prev.shape === 'rect' || prev.shape === 'ellipse') {
          prev.width = p.x - this.interaction.startX;
          prev.height = p.y - this.interaction.startY;
        } else if (prev.shape === 'freehand') {
          prev.points.push({ x: p.x, y: p.y });
          this.updateFreehandBounds(prev);
        }

        this.render();
      } else if (this.interaction.mode === 'moving') {
        const selected = this.getSelected();
        const snap = this.interaction.draggedSnapshot;
        if (!selected || !snap) return;

        const dx = p.x - this.interaction.startX;
        const dy = p.y - this.interaction.startY;

        selected.x = snap.x + dx;
        selected.y = snap.y + dy;

        if (selected.shape === 'freehand' && snap.points) {
          selected.points = snap.points.map(pt => ({
            x: pt.x + dx,
            y: pt.y + dy,
          }));
        }

        this.render();
      } else if (this.interaction.mode === 'resizing') {
        const selected = this.getSelected();
        const snap = this.interaction.draggedSnapshot;
        const handle = this.interaction.resizeHandle;
        if (!selected || !snap || !handle) return;

        this.applyResize(selected, snap, handle.id, p.x, p.y);
        this.render();
      } else if (this.interaction.mode === 'idle') {
        this.updateHoverCursor(p.x, p.y);
      }
    }

    handleMouseUp(e) {
      if (!this.engine.image || this.isComparing) return;

      if (this.interaction.mode === 'panning') {
        this.interaction.mode = 'idle';
        this.updateCursor();
        return;
      }

      if (this.interaction.mode === 'drawing') {
        const prev = this.interaction.previewObject;
        if (prev) {
          const norm = this.engine.normalizeRect(prev.x, prev.y, prev.width, prev.height);
          const minSize = prev.shape === 'freehand' ? 4 : 8;

          if (norm.width >= minSize || norm.height >= minSize || (prev.points && prev.points.length > 2)) {
            const newObj = {
              ...prev,
              id: 'obj_' + Date.now(),
              x: norm.x,
              y: norm.y,
              width: norm.width,
              height: norm.height,
            };

            this.history.push(this.objects);
            this.objects.push(newObj);
            this.setSelectedId(newObj.id);
          }
        }

        this.interaction.previewObject = null;
        this.interaction.mode = 'idle';
        this.render();
        this.updateCursor();
        return;
      }

      if (this.interaction.mode === 'moving' || this.interaction.mode === 'resizing') {
        const selected = this.getSelected();
        const snap = this.interaction.draggedSnapshot;

        if (selected && snap && (selected.x !== snap.x || selected.y !== snap.y || selected.width !== snap.width || selected.height !== snap.height)) {
          this.history.push(this.objects);
        }

        this.interaction.mode = 'idle';
        this.interaction.draggedSnapshot = null;
        this.interaction.resizeHandle = null;
        this.updateCursor();
      }
    }

    handleDoubleClick(e) {
      if (!this.engine.image || this.isComparing) return;

      const p = this.screenToImageCoords(e.clientX, e.clientY);
      // オブジェクト上でない背景のダブルクリックで中央フィット
      const hit = this.engine.hitTest(this.objects, p.x, p.y);
      if (!hit) {
        this.fitToScreen(true);
      }
    }

    // ==========================================
    // リサイズ・バウンディング計算
    // ==========================================
    applyResize(obj, init, handleId, curX, curY) {
      const norm = this.engine.normalizeRect(init.x, init.y, init.width, init.height);
      let nx = norm.x;
      let ny = norm.y;
      let nw = norm.width;
      let nh = norm.height;

      if (handleId.includes('e')) nw = Math.max(8, curX - norm.x);
      if (handleId.includes('s')) nh = Math.max(8, curY - norm.y);
      if (handleId.includes('w')) {
        const right = norm.x + norm.width;
        nx = Math.min(curX, right - 8);
        nw = right - nx;
      }
      if (handleId.includes('n')) {
        const bottom = norm.y + norm.height;
        ny = Math.min(curY, bottom - 8);
        nh = bottom - ny;
      }

      obj.x = nx;
      obj.y = ny;
      obj.width = nw;
      obj.height = nh;

      if (obj.shape === 'freehand' && init.points) {
        const sx = nw / (norm.width || 1);
        const sy = nh / (norm.height || 1);
        obj.points = init.points.map(pt => ({
          x: nx + (pt.x - norm.x) * sx,
          y: ny + (pt.y - norm.y) * sy,
        }));
      }
    }

    updateFreehandBounds(obj) {
      if (!obj.points || obj.points.length === 0) return;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (const pt of obj.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }

      const pad = (obj.brushSize || 24) / 2;
      obj.x = minX - pad;
      obj.y = minY - pad;
      obj.width = Math.max(4, maxX - minX + pad * 2);
      obj.height = Math.max(4, maxY - minY + pad * 2);
    }

    // ==========================================
    // 選択とプロパティ
    // ==========================================
    getSelected() {
      return this.objects.find(o => o.id === this.selectedObjectId) || null;
    }

    setSelectedId(id) {
      this.selectedObjectId = id;
      const selected = this.getSelected();

      if (selected) {
        this.selectionBadge.style.display = 'inline-block';
        this.selectionPanel.style.display = 'flex';

        if (selected.style === 'mosaic') {
          this.setActiveStyle('mosaic');
          this.mosaicIntensity = selected.intensity || 16;
          this.sliderMosaic.value = this.mosaicIntensity;
          this.labelMosaic.textContent = `${this.mosaicIntensity} px`;
        } else if (selected.style === 'blur') {
          this.setActiveStyle('blur');
          this.blurIntensity = selected.intensity || 12;
          this.sliderBlur.value = this.blurIntensity;
          this.labelBlur.textContent = `${this.blurIntensity} px`;
        } else if (selected.style === 'stamp') {
          this.setActiveStyle('stamp');
          if (selected.emoji) {
            this.selectedEmoji = selected.emoji;
            this.activeEmojiPreview.textContent = this.selectedEmoji;
            this.emojiButtons.forEach(b => {
              b.classList.toggle('active', b.dataset.emoji === selected.emoji);
            });
          }
        } else if (selected.style === 'fill-white') {
          this.setActiveStyle('fill-white');
        } else {
          this.setActiveStyle('fill-black');
        }

        if (selected.brushSize) {
          this.brushSize = selected.brushSize;
          this.sliderBrush.value = this.brushSize;
          this.labelBrush.textContent = `${this.brushSize} px`;
        }
      } else {
        this.selectionBadge.style.display = 'none';
        this.selectionPanel.style.display = 'none';
      }

      this.render();
    }

    updateSelectedProps(props) {
      const selected = this.getSelected();
      if (!selected) return;

      this.history.push(this.objects);
      Object.assign(selected, props);
      this.render();
    }

    deleteSelected() {
      if (!this.selectedObjectId) return;
      this.history.push(this.objects);
      this.objects = this.objects.filter(o => o.id !== this.selectedObjectId);
      this.setSelectedId(null);
      this.render();
    }

    // ==========================================
    // 描画サイクル
    // ==========================================
    render() {
      this.engine.render(
        { scale: this.scale, panX: this.panX, panY: this.panY },
        this.objects,
        this.getSelected(),
        this.interaction.previewObject,
        {
          isComparing: this.isComparing,
          bgBlur: this.bgBlur,
        }
      );
    }

    // ==========================================
    // カーソル制御
    // ==========================================
    updateCursor() {
      if (this.isSpacePressed || this.activeTool === 'pan') {
        this.viewport.style.cursor = 'grab';
      } else if (this.activeTool === 'select') {
        this.viewport.style.cursor = 'default';
      } else {
        this.viewport.style.cursor = 'crosshair';
      }
    }

    updateHoverCursor(px, py) {
      if (this.isSpacePressed || this.activeTool === 'pan') {
        this.viewport.style.cursor = 'grab';
        return;
      }

      if (this.activeTool === 'select') {
        const selected = this.getSelected();
        if (selected) {
          const handle = this.engine.getHandleAt(selected, px, py, this.scale);
          if (handle) {
            this.viewport.style.cursor = handle.cursor;
            return;
          }
        }

        const hit = this.engine.hitTest(this.objects, px, py);
        if (hit) {
          this.viewport.style.cursor = 'move';
          return;
        }

        this.viewport.style.cursor = 'default';
      } else {
        this.viewport.style.cursor = 'crosshair';
      }
    }

    // ==========================================
    // Undo / Redo
    // ==========================================
    handleUndo() {
      const prev = this.history.undo(this.objects);
      if (prev !== null) {
        this.objects = prev;
        if (!this.objects.some(o => o.id === this.selectedObjectId)) {
          this.setSelectedId(null);
        }
        this.render();
      }
    }

    handleRedo() {
      const next = this.history.redo(this.objects);
      if (next !== null) {
        this.objects = next;
        if (!this.objects.some(o => o.id === this.selectedObjectId)) {
          this.setSelectedId(null);
        }
        this.render();
      }
    }

    updateHistoryButtons({ canUndo, canRedo }) {
      this.btnUndo.disabled = !canUndo;
      this.btnRedo.disabled = !canRedo;
    }

    // ==========================================
    // エクスポート（保存）
    // ==========================================
    handleSave(format = 'png') {
      if (!this.engine.image) return;

      const isJpeg = format === 'jpeg';
      const targetWidth = isJpeg ? 1200 : null;

      const dataUrl = this.engine.exportImage(
        this.objects,
        {
          bgBlur: this.bgBlur,
          targetWidth: targetWidth,
        },
        format,
        0.92
      );
      if (!dataUrl) return;

      const ext = isJpeg ? 'jpg' : 'png';
      const link = document.createElement('a');
      link.download = `m-${this.imageFileName}.${ext}`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // ==========================================
    // ショートカット
    // ==========================================
    handleKeyDown(e) {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      // Tabキー長押しで比較
      if (e.key === 'Tab') {
        e.preventDefault();
        if (!this.isComparing) {
          this.isComparing = true;
          this.btnCompare.classList.add('active');
          this.comparingBadge.style.display = 'flex';
          this.render();
        }
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const cmd = isMac ? e.metaKey : e.ctrlKey;

      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.handleRedo();
        else this.handleUndo();
        return;
      }

      if (cmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.handleRedo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedObjectId) {
          e.preventDefault();
          this.deleteSelected();
        }
        return;
      }

      if (e.key === 'Escape') {
        this.setSelectedId(null);
        return;
      }

      if (e.code === 'Space' && !this.isSpacePressed) {
        e.preventDefault();
        this.isSpacePressed = true;
        this.viewport.style.cursor = 'grab';
        return;
      }

      const k = e.key.toLowerCase();
      if (k === '0' || (cmd && k === '0')) {
        e.preventDefault();
        this.fitToScreen(true);
        return;
      }
      if (k === 'v') this.setActiveTool('select');
      else if (k === 'r') this.setActiveTool('rect');
      else if (k === 'o') this.setActiveTool('ellipse');
      else if (k === 'p') this.setActiveTool('freehand');
      else if (k === 'h') this.setActiveTool('pan');
    }

    handleKeyUp(e) {
      if (e.key === 'Tab' && this.isComparing) {
        this.isComparing = false;
        this.btnCompare.classList.remove('active');
        this.comparingBadge.style.display = 'none';
        this.render();
        return;
      }

      if (e.code === 'Space' && this.isSpacePressed) {
        this.isSpacePressed = false;
        this.updateCursor();
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.mosaicApp = new MosaicApp();
  });
})(window);
