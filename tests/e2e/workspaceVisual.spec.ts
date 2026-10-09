import { test, expect, openEditor, setSource } from './fixtures';

const article = `# 非对称风险

关于判断、责任与长期选择

---

更好的决策，不是预测未来，而是为不确定的未来做好准备。

## 01 让判断承担后果

在复杂的世界里，我们每天都在做判断。大到职业选择、投资决策、人生方向，小到一次消费、一次表达。判断本身并不可怕，可怕的是不愿意为判断承担后果。

判断的质量，取决于我们是否承担后果。

很多时候，我们习惯于把结果归因于运气、环境或他人，却很少回到判断本身。如果一个人总是为自己的判断负责，他会更谨慎地收集信息，更诚实地面对不确定性，也更愿意在错误后反思和调整。

长期来看，愿意承担后果的人，往往能建立更可靠的判断体系。因为他知道，每一次选择，都是在为未来的自己投下一票。`;

test('阅读稿的版心、轻量文档列表与辅助面板在真实工作区中保持比例', async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 880 });
  await page.addInitScript(() => {
    localStorage.setItem('md-editor-warm-v1', JSON.stringify({ content: '# 阅读样稿', theme: 'light', paperLight: 'snow', readingFont: 'system-serif', fontSize: 18, fileName: '非对称风险.md' }));
    localStorage.setItem('md-editor-pinned-docs', JSON.stringify(['risk']));
  });
  await page.route('**/src/editor/featureFlags.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export const ENABLE_AGENT_BRIDGE = true;' }));
  await page.route('http://127.0.0.1:4317/**', route => route.fulfill({ json: {
    documents: ['非对称风险.md', '随机漫步的傻瓜.md', '阅读与思考.md'].map((fileName, i) => ({ documentId: ['risk', 'walk', 'notes'][i], fileName, updatedAt: '2026-10-09', annotationCount: 3, annotations: [], messages: [] })),
    conversations: [], messages: []
  } }));
  await openEditor(page);
  await setSource(page, article);
  await page.locator('[data-mode=preview]').click();
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  const row = page.locator('.recent-document-item').first();
  await expect(row).toHaveAttribute('title', /3 批注/);
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(44);
  const preview = (await page.locator('.md-preview').boundingBox())!;
  const heading = (await page.locator('.md-preview h1').boundingBox())!;
  expect(heading.x - preview.x).toBeGreaterThanOrEqual(56);
  expect(parseFloat(await page.locator('.md-preview h1').evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(45);
  expect((await page.locator('.ai-composer').boundingBox())!.height).toBeLessThanOrEqual(100);
  // Only the conversation is a static presentation fixture; controls and layout are the real app.
  await page.locator('.ai-readiness').evaluate(el => { el.replaceChildren(); });
  await page.locator('.ai-context').evaluate(el => {
    el.classList.add('has-quote');
    el.querySelector('.ai-status')!.setAttribute('data-state', 'online');
    el.querySelector('.ai-status')!.textContent = '已连接';
    el.querySelector('.ai-quote')!.classList.remove('is-empty');
    el.querySelector('.ai-quote')!.textContent = '判断的质量，取决于我们是否承担后果。';
  });
  await page.locator('.ai-messages').evaluate(el => { el.innerHTML = `<article class="ai-message ai-message-user"><div class="ai-message-label">你</div><div class="ai-message-body">这与长期决策有什么关系？</div></article><article class="ai-message ai-message-assistant"><div class="ai-message-label">Codex</div><div class="ai-message-body"><p>这句话与长期决策有着直接而深刻的联系，主要体现在以下两个方面：</p><p><strong>1. 承担后果促使更审慎的决策</strong><br>当我们意识到需要为自己的判断承担后果时，会更认真地评估信息、考虑多种可能性，而不是追求短期的情绪满足或便利。</p><p><strong>2. 在反馈中不断提升判断能力</strong><br>长期决策的价值不在于单次的幸运，而在于通过承担后果获得真实的反馈。无论成功还是失败，这些经验都会帮助我们更清晰地认识自己。</p><p>因此，承担后果既是一种责任，也是一种长期主义的思维方式。</p></div></article>`; });
  await page.screenshot({ animations: 'disabled', path: info.outputPath('workspace-light.png') });
  await page.keyboard.press('ControlOrMeta+,');
  await page.locator('.appearance-theme').click();
  await page.keyboard.press('Escape');
  await page.screenshot({ animations: 'disabled', path: info.outputPath('workspace-dark.png') });
});
