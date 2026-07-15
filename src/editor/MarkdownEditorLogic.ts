// The DC runtime supplies its base class dynamically, so this controller uses
// a small factory instead of importing runtime internals.
// @ts-nocheck
import { SAMPLE_MARKDOWN } from './sample';
import { EDITOR_STORAGE_KEY, loadEditorState } from './storage';
import { AIMethods } from './aiMethods';
import { BridgeMethods } from './bridgeMethods';
import { CommentMethods } from './commentMethods';
import { DiagramMethods } from './diagramMethods';
import { EditingFileLayoutMethods } from './editingFileLayoutMethods';
import { ENABLE_AGENT_BRIDGE } from './featureFlags';
import { addTableRules } from './markdownTableRules';
import { NavigationMethods } from './navigationMethods';
import { applyPrototypeMethods } from './prototypeMethods';
import { ViewMethods } from './viewMethods';

export function createMarkdownEditorComponent(DCLogic, React) {
  const Component = class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.sourceRef = React.createRef();
    this.previewRef = React.createRef();
    this.previewPaneRef = React.createRef();
    this.outlineButtonRef = React.createRef();
    this.outlinePanelRef = React.createRef();
    this.outlineListRef = React.createRef();
    this.outlineCountRef = React.createRef();
    this.fullscreenIconRef = React.createRef();
    this.fullscreenLabelRef = React.createRef();
    this.dividerRef = React.createRef();
    this.splitRef = React.createRef();
    this.fileNameRef = React.createRef();
    this.dirtyDotRef = React.createRef();
    this.saveStatusRef = React.createRef();
    this.countRef = React.createRef();
    this.fontSizeRef = React.createRef();
    this.fullscreenFontSizeRef = React.createRef();
    this.fontSize = 16;
    this.selBarRef = React.createRef();
    this.commentsRef = React.createRef();
    this.commentListRef = React.createRef();
    this.commentCountRef = React.createRef();
    this.previewCommentCountRef = React.createRef();
    this.aiPanelRef = React.createRef();
    this.aiResizeRef = React.createRef();
    this.aiMessagesRef = React.createRef();
    this.aiHistoryRef = React.createRef();
    this.aiHistoryListRef = React.createRef();
    this.aiQuoteRef = React.createRef();
    this.aiInputRef = React.createRef();
    this.aiStatusRef = React.createRef();
    this.aiSendRef = React.createRef();
    this.themeIconRef = React.createRef();
    this.viewModeButtonRef = React.createRef();
    this.viewModeLabelRef = React.createRef();
    this.documentSidebarRef = React.createRef();
    this.documentSidebarResizeRef = React.createRef();
    this.documentListRef = React.createRef();
    this.documentCountRef = React.createRef();
    this.comments = [];
    this.recentDocuments = [];
    this.activeDocumentId = null;
    this.bridgeDocumentId = null;
    this.activeAnswerRequestId = null;
    this.previewOverrideMarkdown = '';
    this._bridgeSyncT = null;
    this._mermaidBatch = 0;
    this.aiMessages = [];
    this.aiConversations = [];
    this.aiHistoryOpen = false;
    this.aiQuote = '';
    this.aiPanelOpen = false;
    this.aiBusy = false;
    this.aiBridgeOnline = false;
    this.aiPanelWidth = 480;
    this.documentSidebarWidth = 236;
    this.theme = 'dark';
    this._themeTouched = false;
    this.panelOpen = false;
    this.previewFullscreen = false;
    this.outlineOpen = false;
    this.viewMode = 'preview';
    this._pending = null;
    this.fileHandle = null;
    this.dirty = false;
    this._saveT = null;
    this.agentBridgeEnabled = ENABLE_AGENT_BRIDGE;
  }

  get LS_KEY() { return EDITOR_STORAGE_KEY; }

  SAMPLE() {
    return SAMPLE_MARKDOWN;
  }

  componentDidMount() { this._waitLibs(0); }

  _waitLibs(tries) {
    if (window.marked && window.TurndownService) {
      this._init();
    } else if (tries < 80) {
      setTimeout(() => this._waitLibs(tries + 1), 60);
    } else if (this.saveStatusRef.current) {
      this.saveStatusRef.current.textContent = '渲染库加载失败';
    }
  }

  _init() {
    const src = this.sourceRef.current;
    const prev = this.previewRef.current;
    if (!src || !prev) return;

    if (window.marked.setOptions) window.marked.setOptions({ gfm: true, breaks: true });
    document.body.classList.toggle('agent-bridge-enabled', this.agentBridgeEnabled);
    this.td = new window.TurndownService({
      headingStyle: 'atx', codeBlockStyle: 'fenced',
      bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**'
    });
    this.td.addRule('strikethrough', { filter: ['del', 's'], replacement: (c) => '~~' + c + '~~' });
    addTableRules(this.td);

    let initial = this.SAMPLE();
    let name = '未命名.md';
    // 未持久化过主题时跟随系统外观
    this.theme = this.props.theme
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const saved = loadEditorState();
    if (saved && typeof saved.content === 'string') {
      initial = this._cleanOpenedMarkdown(saved.content);
      if (saved.fileName) name = saved.fileName;
      if (saved.fontSize) this.fontSize = saved.fontSize;
      if (Array.isArray(saved.comments)) this.comments = saved.comments;
      if (saved.bridgeDocumentId) {
        this.bridgeDocumentId = saved.bridgeDocumentId;
        this.activeDocumentId = saved.bridgeDocumentId;
      }
      if (saved.theme) { this.theme = saved.theme; this._themeTouched = true; }
    }

    src.value = initial;
    this.fileName = name;
    if (this.fileNameRef.current) this.fileNameRef.current.textContent = name;
    this._applyTheme();
    this._applyFont();
    this._renderPreview();
    this._updateCount();
    this._setStatus('就绪 · 自动保存已开启');
    this._applyProps();

    src.addEventListener('input', () => { this._renderPreview(); this._touch(); });
    prev.addEventListener('input', () => { this._syncFromPreview(); this._touch(); });
    prev.addEventListener('click', (e) => this._openPreviewLink(e));
    prev.addEventListener('scroll', () => this._syncActiveOutlineItem());
    src.addEventListener('dblclick', () => this._onSourceDbl());
    prev.addEventListener('dblclick', (e) => this._onPreviewDbl(e));
    src.addEventListener('keydown', (e) => this._sourceKeydown(e));
    this._keyHandler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.onSave(); }
      if (e.key === 'Escape' && this.previewFullscreen) {
        e.preventDefault();
        this.togglePreviewFullscreen(false);
      } else if (e.key === 'Escape' && this.outlineOpen) {
        e.preventDefault();
        this.toggleOutline(false);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
    this._resizeHandler = () => {
      this._syncViewMode();
      if (this.agentBridgeEnabled) {
        this._applyDocumentSidebarWidth(this.documentSidebarWidth);
        if (this.aiPanelOpen) this._applyAIPanelWidth(this.aiPanelWidth);
      }
    };
    window.addEventListener('resize', this._resizeHandler);

    this._initDivider();
    this._initComments();
    this._renderComments();
    if (this.agentBridgeEnabled) {
      this._initDocumentSidebarResize();
      this._initAI();
      this._refreshRecentDocuments();
    }
    this._syncViewMode();
  }

  componentDidUpdate() { this._applyProps(); }

  _applyProps() {
    const prev = this.previewRef.current, src = this.sourceRef.current;
    if (!prev || !src) return;
    prev.setAttribute('contenteditable', (this.props.previewEditable ?? true) ? 'true' : 'false');
    const wrap = this.props.wrapSource ?? true;
    src.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    src.setAttribute('wrap', wrap ? 'soft' : 'off');
    if (!this._themeTouched && this.props.theme && this.props.theme !== this.theme) {
      this.theme = this.props.theme; this._applyTheme();
    }
  }

  componentWillUnmount() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._outlineJumpT) clearTimeout(this._outlineJumpT);
    document.body.style.overflow = '';
  }

  renderVals() {
    return {
      sourceRef: this.sourceRef,
      previewRef: this.previewRef,
      previewPaneRef: this.previewPaneRef,
      outlineButtonRef: this.outlineButtonRef,
      outlinePanelRef: this.outlinePanelRef,
      outlineListRef: this.outlineListRef,
      outlineCountRef: this.outlineCountRef,
      fullscreenIconRef: this.fullscreenIconRef,
      fullscreenLabelRef: this.fullscreenLabelRef,
      dividerRef: this.dividerRef,
      splitRef: this.splitRef,
      fileNameRef: this.fileNameRef,
      dirtyDotRef: this.dirtyDotRef,
      saveStatusRef: this.saveStatusRef,
      countRef: this.countRef,
      fontSizeRef: this.fontSizeRef,
      fullscreenFontSizeRef: this.fullscreenFontSizeRef,
      themeIconRef: this.themeIconRef,
      selBarRef: this.selBarRef,
      commentsRef: this.commentsRef,
      commentListRef: this.commentListRef,
      commentCountRef: this.commentCountRef,
      previewCommentCountRef: this.previewCommentCountRef,
      aiPanelRef: this.aiPanelRef,
      aiResizeRef: this.aiResizeRef,
      aiMessagesRef: this.aiMessagesRef,
      aiHistoryRef: this.aiHistoryRef,
      aiHistoryListRef: this.aiHistoryListRef,
      aiQuoteRef: this.aiQuoteRef,
      aiInputRef: this.aiInputRef,
      aiStatusRef: this.aiStatusRef,
      aiSendRef: this.aiSendRef,
      viewModeButtonRef: this.viewModeButtonRef,
      viewModeLabelRef: this.viewModeLabelRef,
      documentSidebarRef: this.documentSidebarRef,
      documentSidebarResizeRef: this.documentSidebarResizeRef,
      documentListRef: this.documentListRef,
      documentCountRef: this.documentCountRef,
      toggleViewMode: () => this.toggleViewMode(),
      toggleDocumentSidebar: () => this.toggleDocumentSidebar(),
      closeDocumentSidebar: () => this.closeDocumentSidebar(),
      fontInc: () => this._setFont(this.fontSize + 1),
      fontDec: () => this._setFont(this.fontSize - 1),
      toggleTheme: () => this.toggleTheme(),
      togglePreviewFullscreen: () => this.togglePreviewFullscreen(),
      toggleOutline: () => this.toggleOutline(),
      toggleComments: () => this._openPanel(),
      closePanel: () => this._openPanel(false),
      toggleAI: () => this._openAIPanel(),
      closeAI: () => this._openAIPanel(false),
      toggleAIHistory: () => this.toggleAIHistory(),
      sendAIQuestion: () => this.sendAIQuestion(),
      askExplain: () => this.askAIQuick('请用更容易理解的语言解释这段话。'),
      askContext: () => this.askAIQuick('这段话在全文上下文中起什么作用？'),
      askChallenge: () => this.askAIQuick('这段话有哪些隐含假设或值得质疑的地方？'),
      copySel: () => this.copySel(),
      markMarker: () => this.markMarker(),
      markWavy: () => this.markWavy(),
      markStraight: () => this.markStraight(),
      writeIdea: () => this.writeIdea(),
      aiAsk: () => this.aiAsk(),
      copyAll: () => this.copyAll(),
      copyFull: () => this.copyFull(),
      noop: (e) => { if (e && e.preventDefault) e.preventDefault(); },
      onOpen: () => this.onOpen(),
      onSave: () => this.onSave(),
      onNew: () => this.onNew(),
      fmtH: () => this._linePrefix('## '),
      fmtB: () => this._wrapSel('**', '**', '粗体'),
      fmtI: () => this._wrapSel('*', '*', '斜体'),
      fmtQuote: () => this._linePrefix('> '),
      fmtList: () => this._linePrefix('- '),
      fmtCode: () => this._wrapSel('`', '`', 'code'),
      fmtLink: () => this._wrapSel('[', '](https://)', '链接文字')
    };
  }
  };
  applyPrototypeMethods(
    Component,
    ViewMethods,
    BridgeMethods,
    NavigationMethods,
    CommentMethods,
    DiagramMethods,
    AIMethods,
    EditingFileLayoutMethods
  );
  return Component;
}
