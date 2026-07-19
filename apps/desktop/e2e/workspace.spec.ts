import { expect, test } from '@playwright/test'

test('preview starts empty and supports a local task draft', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '准备开始' })).toBeVisible()
  await expect(page.getByText('连接 Grok 后将在这里显示实时 Git 变更。')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认审阅' })).toBeDisabled()
  await page.getByRole('textbox', { name: '任务输入' }).fill('检查当前项目')
  await page.getByRole('button', { name: '发送任务' }).click()
  await expect(page.getByRole('heading', { name: '检查当前项目' })).toBeVisible()
  await expect(page.getByRole('button', { name: '切换到任务 检查当前项目' })).toBeVisible()
})
