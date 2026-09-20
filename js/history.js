/**
 * history.js
 * 操作の「元に戻す (Undo)」および「やり直し (Redo)」を管理する履歴スタック
 */

(function (global) {
  class HistoryManager {
    constructor(onStateChange) {
      this.undoStack = [];
      this.redoStack = [];
      this.maxStackSize = 50;
      this.onStateChange = onStateChange;
    }

    /**
     * 現在のオブジェクト一覧のスナップショットを保存
     * @param {Array} objects 
     */
    push(objects) {
      const snapshot = JSON.parse(JSON.stringify(objects));
      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }
      this.redoStack = []; // 新たな変更が入ったらRedoはクリア
      this.notify();
    }

    /**
     * 元に戻す (Undo)
     * @param {Array} currentObjects 
     * @returns {Array|null} 直前のオブジェクト配列
     */
    undo(currentObjects) {
      if (!this.canUndo()) return null;
      const current = JSON.parse(JSON.stringify(currentObjects));
      this.redoStack.push(current);
      const previous = this.undoStack.pop();
      this.notify();
      return JSON.parse(JSON.stringify(previous));
    }

    /**
     * やり直し (Redo)
     * @param {Array} currentObjects 
     * @returns {Array|null} 次のオブジェクト配列
     */
    redo(currentObjects) {
      if (!this.canRedo()) return null;
      const current = JSON.parse(JSON.stringify(currentObjects));
      this.undoStack.push(current);
      const next = this.redoStack.pop();
      this.notify();
      return JSON.parse(JSON.stringify(next));
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
      this.notify();
    }

    notify() {
      if (typeof this.onStateChange === 'function') {
        this.onStateChange({
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }
    }
  }

  global.HistoryManager = HistoryManager;
})(window);
