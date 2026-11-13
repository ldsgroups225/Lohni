import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import * as icons from './NavigationIcons'

it('keeps new icons inline with default and custom sizes', () => {
  const { HomeIcon, CoursesIcon, TutorIcon, ProfileIcon, FlameIcon, CheckIcon, CloseIcon, ...inlineIcons } = icons
  void [HomeIcon, CoursesIcon, TutorIcon, ProfileIcon, FlameIcon, CheckIcon, CloseIcon]
  for (const Icon of Object.values(inlineIcons)) {
    expect(renderToStaticMarkup(<Icon />)).toContain('class="inline-block size-5"')
    expect(renderToStaticMarkup(<Icon className="size-14" />)).toContain('class="inline-block size-14"')
  }
})
