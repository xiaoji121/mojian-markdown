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
import { DEFAULT_LONG_IMAGE_PRESET } from './longImageComposer';
import { LongImageMethods } from './longImageMethods';
import { LocalFileSyncMethods } from './localFileSyncMethods';
import { NavigationMethods } from './navigationMethods';
import { AISettingsMethods } from './aiSettingsMethods';
import { applyPrototypeMethods } from './prototypeMethods';
import { PathComposeMethods } from './pathComposeMethods';
import { PreviewSearchMethods } from './previewSearchMethods';
import { ReadingMapMethods } from './readingMapMethods';
import { TranslateMethods } from './translateMethods';
import { SearchReplaceMethods } from './searchReplaceMethods';
import { ViewMethods } from './viewMethods';

export function createMarkdownEditorComponent(DCLogic, React) {
  const Component = class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.sourceRef = React.createRef();
    this.previewRef = React.createRef();
    this.previewTitleRef = React.createRef();
    this.previewPaneRef = React.createRef();
    this.outlineButtonRef = React.createRef();
    this.outlinePanelRef = React.createRef();
    this.outlineListRef = React.createRef();
    this.outlineCountRef = React.createRef();
    this.undoButtonRef = React.createRef();
    this.redoButtonRef = React.createRef();
    this.fullscreenIconRef = React.createRef();
    this.fullscreenLabelRef = React.createRef();
    this.dividerRef = React.createRef();
    this.splitRef = React.createRef();
    this.fileNameRef = React.createRef();
    this.fileMenuRef = React.createRef();
    this.fileMenuButtonRef = React.createRef();
    this.dirtyDotRef = React.createRef();
    this.saveStatusRef = React.createRef();
    this.countRef = React.createRef();
    this.fontSizeRef = React.createRef();
    this.fullscreenFontSizeRef = React.createRef();
    this.paperPickerRef = React.createRef();
    this.immersiveWideRef = React.createRef();
    this.headerMoreRef = React.createRef();
    this.headerMenuRef = React.createRef();
    this.fontSize = 16;
    this.searchBarRef = React.createRef();
    this.searchInputRef = React.createRef();
    this.replaceInputRef = React.createRef();
    this.searchCountRef = React.createRef();
    this.searchCaseRef = React.createRef();
    this.searchWordRef = React.createRef();
    this.searchRegexRef = React.createRef();
    this.searchExpandRef = React.createRef();
    this.searchOpen = false;
    this.searchCaseSensitive = false;
    this.searchWholeWord = false;
    this.searchRegex = false;
    this.searchReplaceExpanded = false;
    this._searchMatches = [];
    this._searchIndex = -1;
    this._searchAnchor = 0;
    this.sourceHighlightRef = React.createRef();
    this.previewSearchBarRef = React.createRef();
    this.previewSearchInputRef = React.createRef();
    this.previewSearchCountRef = React.createRef();
    this.previewSearchOpen = false;
    this._previewSearchRanges = [];
    this._previewSearchIndex = -1;
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
    this.aiEngineChipRef = React.createRef();
    this.themeIconRef = React.createRef();
    this.viewModeSwitcherRef = React.createRef();
    this.documentSidebarRef = React.createRef();
    this.documentSidebarResizeRef = React.createRef();
    this.documentListRef = React.createRef();
    this.documentCountRef = React.createRef();
    this.readingPathBarRef = React.createRef();
    this.readingPathModeRef = React.createRef();
    this.readingPathCountRef = React.createRef();
    this.readingPathInstructionRef = React.createRef();
    this.readingPathSelectMode = false;
    this._readingPathSelection = new Set();
    this._readingPathDocId = null;
    this._composeBusy = false;
    this._composeRenderT = null;
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
    this.aiEngine = 'claude';
    this.aiHistoryOpen = false;
    this.aiQuote = '';
    this.aiPanelOpen = false;
    this.aiBusy = false;
    this.aiBridgeOnline = false;
    this.aiPanelWidth = 480;
    this.documentSidebarWidth = 236;
    this.theme = 'dark';
    this.paperDark = ''; // 纸色按主题分别记忆；空 = 该主题默认
    this.paperLight = '';
    this.immersiveWide = false;
    this.longImageWidth = DEFAULT_LONG_IMAGE_PRESET;
    this.longImageMarks = true;
    this._themeTouched = false;
    this.panelOpen = false;
    this.previewFullscreen = false;
    this.outlineOpen = false;
    this.viewMode = 'split';
    this._pending = null;
    this.fileHandle = null;
    this.dirty = false;
    this._saveT = null;
    this.agentBridgeEnabled = ENABLE_AGENT_BRIDGE;
    this._localFileModifiedAt = 0;
    this._localWriteBusy = false;
    this._localFileConflict = false;
    this._fileWatchT = null;
    this._fileWatchFocus = null;
    this._draftSavedAt = 0;
    this.localFilePath = null;
    this._folderHandles = null;
    this._startedWithSample = false;
    this._localImageCache = new Map();
  }

  get LS_KEY() { return EDITOR_STORAGE_KEY; }

  SAMPLE() {
    return SAMPLE_MARKDOWN;
  }

  componentDidMount() { this._waitLibs(0); }

  _waitLibs(tries) {
    if (window.marked) {
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
    let initial = this.SAMPLE();
    let name = '未命名.md';
    // 未持久化过主题时跟随系统外观
    this.theme = this.props.theme
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const saved = loadEditorState();
    this._startedWithSample = !(saved && typeof saved.content === 'string');
    if (saved && typeof saved.content === 'string') {
      initial = this._cleanOpenedMarkdown(saved.content);
      if (saved.fileName) name = saved.fileName;
      if (saved.fontSize) this.fontSize = saved.fontSize;
      if (Array.isArray(saved.comments)) this.comments = saved.comments;
      if (saved.bridgeDocumentId) {
        this.bridgeDocumentId = saved.bridgeDocumentId;
        this.activeDocumentId = saved.bridgeDocumentId;
      }
      if (saved.savedAt) this._draftSavedAt = saved.savedAt;
      if (saved.aiEngine === 'codex' || saved.aiEngine === 'gemini') this.aiEngine = saved.aiEngine;
      if (saved.theme) { this.theme = saved.theme; this._themeTouched = true; }
      if (saved.paperDark) this.paperDark = saved.paperDark;
      if (saved.paperLight) this.paperLight = saved.paperLight;
      if (saved.immersiveWide) this.immersiveWide = true;
      if (saved.longImageWidth) this.longImageWidth = saved.longImageWidth;
      if (saved.longImageMarks === false) this.longImageMarks = false;
      if (saved.paper) {
        // 迁移旧的单份纸色记忆：墨黑归暗色，其余归亮色
        if (saved.paper === 'ink') this.paperDark = this.paperDark || saved.paper;
        else this.paperLight = this.paperLight || saved.paper;
      }
    }

    src.value = initial;
    this.fileName = name;
    if (this.fileNameRef.current) this.fileNameRef.current.textContent = name;
    this._applyTheme();
    this._buildPaperPicker();
    this._syncImmersiveWideButton();
    this._applyFont();
    this._renderPreview();
    this._updateCount();
    this._resetEditingHistory();
    this._setStatus('就绪 · 自动保存已开启');
    this._applyProps();

    src.addEventListener('beforeinput', () => this._syncCurrentEditingState());
    src.addEventListener('input', (e) => {
      this._recordEditingHistory(e.inputType || '');
      this._renderPreview();
      this._touch();
    });
    prev.addEventListener('click', (e) => this._openPreviewLink(e));
    prev.addEventListener('scroll', () => this._syncActiveOutlineItem());
    src.addEventListener('dblclick', () => this._onSourceDbl());
    prev.addEventListener('dblclick', (e) => this._onPreviewDbl(e));
    src.addEventListener('keydown', (e) => this._sourceKeydown(e));
    this._keyHandler = (e) => {
      if (this._handleSearchShortcut(e)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) this.onSaveAs();
        else this.onSave();
      }
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
    this._initSearchBar();
    this._initPreviewSearch();
    this._initComments();
    this._renderComments();
    if (this.agentBridgeEnabled) {
      this._initDocumentSidebarResize();
      this._initAI();
      this._refreshRecentDocuments().then(() => this._maybeOpenLatestRecentDocument());
    }
    this._syncViewMode();
    // 桌面端：接上应用菜单与「双击 .md 打开」事件。
    if (window.mojianDesktop) this._initDesktop();
    // 上次会话打开过本地文件时，恢复与它的双向同步关联。
    this._restoreLocalFileLink();
  }

  componentDidUpdate() { this._applyProps(); }

  _applyProps() {
    const prev = this.previewRef.current, src = this.sourceRef.current;
    if (!prev || !src) return;
    this._syncPreviewEditable();
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
    this._disposePathTooltip();
    this._disposeReadingPathHelp();
    this._stopLocalFileWatcher();
    document.body.style.overflow = '';
  }

  renderVals() {
    return {
      sourceRef: this.sourceRef,
      previewRef: this.previewRef,
      previewTitleRef: this.previewTitleRef,
      previewPaneRef: this.previewPaneRef,
      outlineButtonRef: this.outlineButtonRef,
      outlinePanelRef: this.outlinePanelRef,
      outlineListRef: this.outlineListRef,
      outlineCountRef: this.outlineCountRef,
      undoButtonRef: this.undoButtonRef,
      redoButtonRef: this.redoButtonRef,
      fullscreenIconRef: this.fullscreenIconRef,
      fullscreenLabelRef: this.fullscreenLabelRef,
      dividerRef: this.dividerRef,
      splitRef: this.splitRef,
      fileNameRef: this.fileNameRef,
      fileMenuRef: this.fileMenuRef,
      fileMenuButtonRef: this.fileMenuButtonRef,
      dirtyDotRef: this.dirtyDotRef,
      saveStatusRef: this.saveStatusRef,
      countRef: this.countRef,
      fontSizeRef: this.fontSizeRef,
      fullscreenFontSizeRef: this.fullscreenFontSizeRef,
      paperPickerRef: this.paperPickerRef,
      immersiveWideRef: this.immersiveWideRef,
      headerMoreRef: this.headerMoreRef,
      headerMenuRef: this.headerMenuRef,
      themeIconRef: this.themeIconRef,
      searchBarRef: this.searchBarRef,
      searchInputRef: this.searchInputRef,
      replaceInputRef: this.replaceInputRef,
      searchCountRef: this.searchCountRef,
      searchCaseRef: this.searchCaseRef,
      searchWordRef: this.searchWordRef,
      searchRegexRef: this.searchRegexRef,
      searchExpandRef: this.searchExpandRef,
      sourceHighlightRef: this.sourceHighlightRef,
      previewSearchBarRef: this.previewSearchBarRef,
      previewSearchInputRef: this.previewSearchInputRef,
      previewSearchCountRef: this.previewSearchCountRef,
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
      aiEngineChipRef: this.aiEngineChipRef,
      viewModeSwitcherRef: this.viewModeSwitcherRef,
      documentSidebarRef: this.documentSidebarRef,
      documentSidebarResizeRef: this.documentSidebarResizeRef,
      documentListRef: this.documentListRef,
      documentCountRef: this.documentCountRef,
      ...this._readingPathRenderVals(),
      showEditorMode: () => this.setViewMode('editor'),
      showSplitMode: () => this.setViewMode('split'),
      showPreviewMode: () => this.setViewMode('preview'),
      toggleDocumentSidebar: () => this.toggleDocumentSidebar(),
      closeDocumentSidebar: () => this.closeDocumentSidebar(),
      fontInc: () => this._setFont(this.fontSize + 1),
      fontDec: () => this._setFont(this.fontSize - 1),
      toggleTheme: () => this.toggleTheme(),
      togglePreviewFullscreen: () => this.togglePreviewFullscreen(),
      toggleImmersiveWide: () => this.toggleImmersiveWide(),
      toggleHeaderMenu: () => this.toggleHeaderMenu(),
      menuTheme: () => { this.toggleTheme(); this.toggleHeaderMenu(false); },
      toggleFileMenu: () => this.toggleFileMenu(),
      menuFileNew: () => { this.toggleFileMenu(false); this.onNew(); },
      menuFileOpen: () => { this.toggleFileMenu(false); this.onOpen(); },
      menuFileSave: () => { this.toggleFileMenu(false); this.onSave(); },
      menuFileSaveAs: () => { this.toggleFileMenu(false); this.onSaveAs(); },
      menuFolder: () => { this.toggleHeaderMenu(false); this.associateLocalFolder(); },
      toggleOutline: () => this.toggleOutline(),
      openLongImage: () => this.openLongImage(),
      toggleSearch: () => this.toggleSearch(),
      closeSearch: () => this.closeSearch(),
      searchPrev: () => this.searchPrev(),
      searchNext: () => this.searchNext(),
      toggleSearchCase: () => this.toggleSearchCase(),
      toggleSearchWord: () => this.toggleSearchWord(),
      toggleSearchRegex: () => this.toggleSearchRegex(),
      toggleSearchReplaceRow: () => this.toggleSearchReplaceRow(),
      replaceCurrent: () => this.replaceCurrent(),
      replaceAll: () => this.replaceAll(),
      togglePreviewSearch: () => this.togglePreviewSearch(),
      closePreviewSearch: () => this.closePreviewSearch(),
      previewSearchPrev: () => this.previewSearchPrev(),
      previewSearchNext: () => this.previewSearchNext(),
      toggleComments: () => this._openPanel(),
      closePanel: () => this._openPanel(false),
      toggleAI: () => this._openAIPanel(),
      closeAI: () => this._openAIPanel(false),
      toggleAIHistory: () => this.toggleAIHistory(),
      sendAIQuestion: () => this.sendAIQuestion(),
      openAISettings: () => this.openAISettings(),
      menuSettings: () => { this.toggleHeaderMenu(false); this.openAISettings(); },
      translateSel: () => this.translateSel(),
      askExplain: () => this.askAIQuick('请用更容易理解的语言解释这段话。'),
      askContext: () => this.askAIQuick('这段话在全文上下文中起什么作用？'),
      askChallenge: () => this.askAIQuick('这段话有哪些隐含假设或值得质疑的地方？'),
      copySel: () => this.copySel(),
      markMarker: () => this.markMarker(),
      markWavy: () => this.markWavy(),
      markStraight: () => this.markStraight(),
      writeIdea: () => this.writeIdea(),
      aiAsk: () => this.aiAsk(),
      copyAll: (e) => this.copyAll(e),
      copyFull: (e) => this.copyFull(e),
      noop: (e) => { if (e && e.preventDefault) e.preventDefault(); },
      onOpen: () => this.onOpen(),
      onSave: () => this.onSave(),
      onSaveAs: () => this.onSaveAs(),
      onNew: () => this.onNew(),
      undoEdit: () => this.undoEdit(),
      redoEdit: () => this.redoEdit(),
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
    ReadingMapMethods,
    PathComposeMethods,
    NavigationMethods,
    SearchReplaceMethods,
    PreviewSearchMethods,
    CommentMethods,
    DiagramMethods,
    LongImageMethods,
    AIMethods,
    AISettingsMethods,
    TranslateMethods,
    EditingFileLayoutMethods,
    LocalFileSyncMethods
  );
  return Component;
}
