/* @flow */
import CodeMirror from "codemirror";
import type { CodeMirrorOptions, CodeMirrorTextarea } from "codemirror";
import events from "events";
import type { Toolbar, Keymap, Adapter } from "./Adapter";
import { Range, Pos } from "./util";

require("codemirror/mode/gfm/gfm");

type CMAdapterOptions = {
  codemirror: CodeMirrorOptions
};

/**
 * Adapter to use CodeMirror for the editor
 * @class
 */
class CodeMirrorAdapter extends events.EventEmitter implements Adapter {
  textareaNode: HTMLTextAreaElement;
  toolbarNode: HTMLDivElement;
  wrapperNode: HTMLDivElement;
  options: CMAdapterOptions;
  cm: CodeMirrorTextarea;

  constructor(
    textarea: HTMLTextAreaElement,
    options: CMAdapterOptions = { codemirror: {} }
  ) {
    if (!textarea || textarea.nodeName !== "TEXTAREA")
      throw new Error("No textarea provided");
    super();

    /** @type {HTMLTextAreaElement} */
    this.textareaNode = textarea;
    /** @type {HTMLDivElement} */
    this.toolbarNode = document.createElement("div");
    /** @type {HTMLDivElement} */
    this.wrapperNode = document.createElement("div");
    this.wrapperNode.appendChild(this.toolbarNode);

    this.wrapperNode.className = "editor-wrapper editor-codemirror-adapter";
    this.toolbarNode.className = "editor-toolbar";

    this.options = options;
  }

  /**
   * Called when the adapter is attached
   */
  attach(): void {
    if (this.textareaNode.parentNode) {
      this.textareaNode.parentNode.insertBefore(
        this.wrapperNode,
        this.textareaNode.nextSibling
      );
    }
    this.wrapperNode.appendChild(this.textareaNode);

    const defaults: CodeMirrorOptions = {
      mode: {
        name: "gfm",
        gitHubSpice: false
      },
      tabMode: "indent",
      lineWrapping: true
    };
    this.cm = CodeMirror.fromTextArea(
      this.textareaNode,
      Object.assign(defaults, this.options.codemirror)
    );

    this.cm.on("paste", (cm, e) => {
      this.emit("paste", e);
    });
    this.cm.on("drop", (cm, e) => {
      this.emit("drop", e);
    });
  }

  setToolbar(t: Toolbar) {
    const setToolbar = (toolbar: Toolbar, _toolbarNode: HTMLDivElement) => {
      const toolbarNode = _toolbarNode.cloneNode(false);
      const focusHandler = (wrapper, action) => () => {
        if (action === "add") {
          toolbarNode.classList.add("active");
          wrapper.classList.add("active");
        } else {
          toolbarNode.classList.remove("active");
          wrapper.classList.remove("active");
        }
      };

      toolbar.forEach(({ action, alt, children }, name) => {
        const wrapper = document.createElement("div");
        wrapper.className = "editor-button-wrapper";
        const button = document.createElement("button");
        const text = document.createTextNode(name);
        button.appendChild(text);
        button.classList.add("editor-button");
        if (action.type) button.classList.add(`editor-button-${action.type}`);
        if (alt) button.title = alt;
        button.addEventListener("click", () => this.emit("action", action));
        button.addEventListener("focus", focusHandler(wrapper, "add"));
        button.addEventListener("blur", focusHandler(wrapper, "remove"));
        wrapper.appendChild(button);

        if (children && children.size > 0) {
          const childWrapper = document.createElement("div");
          childWrapper.className = "editor-toolbar-children";
          setToolbar(children, childWrapper);
          wrapper.appendChild(childWrapper);
        }

        toolbarNode.appendChild(wrapper);
      });

      if (_toolbarNode.parentNode)
        _toolbarNode.parentNode.replaceChild(toolbarNode, _toolbarNode);
      return toolbarNode;
    };

    this.toolbarNode = setToolbar(t, this.toolbarNode);
  }

  /**
   * Called when the keymap is changed
   * @param {Map.<string, object>} keymap
   */
  setKeymap(keymap: Keymap) {
    const cmKeymap = { fallthrough: "default" };
    const handler = action => () => {
      if (typeof action === "function") {
        const result = action.call();
        if (result === false) return CodeMirror.Pass;
      } else {
        this.emit("action", action);
      }
      return false;
    };

    keymap.forEach((action, key) => {
      cmKeymap[key] = handler(action);
      // Remove default key behaviour
      // Useful for keeping tab default behaviour
      if (CodeMirror.keyMap.basic[key]) {
        CodeMirror.keyMap.basic[key] = false;
      }
    });

    this.cm.setOption("keyMap", CodeMirror.normalizeKeyMap(cmKeymap));
  }

  listSelections() {
    return this.cm.listSelections().map(Range.fromCmRange);
  }

  focus() {
    this.cm.focus();
  }

  getRange(range: Range) {
    return this.cm.getDoc().getRange(range.start, range.end);
  }

  replaceRange(replacement: string, range: Range) {
    this.cm.getDoc().replaceRange(replacement, range.start, range.end);
  }

  setSelection(...selections: Array<Range | Pos>) {
    const mappedSelections = selections.map(sel => {
      if (sel instanceof Range) {
        return { anchor: sel.start, head: sel.end };
      }
      return { anchor: sel };
    });

    this.cm.setSelections(mappedSelections);
  }

  getLine(line: number) {
    return this.cm.getDoc().getLine(line);
  }

  getText() {
    return this.cm.getDoc().getValue();
  }

  setText(text: string) {
    this.cm.getDoc().setValue(text);
    this.cm.save();
  }

  lock() {
    this.cm.setOption("readOnly", true);
  }

  unlock() {
    this.cm.setOption("readOnly", false);
  }

  /**
   * Destroy the instance
   */
  destroy() {
    this.removeAllListeners();
    this.cm.toTextArea();

    this.wrapperNode.removeChild(this.toolbarNode);
    if (this.wrapperNode.parentNode) {
      const node: Node = this.wrapperNode.parentNode;
      node.insertBefore(this.textareaNode, this.wrapperNode.nextSibling);
      node.removeChild(this.wrapperNode);
    }

    delete this.toolbarNode;
    delete this.wrapperNode;
  }
}

module.exports = CodeMirrorAdapter;
