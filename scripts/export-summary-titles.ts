import { chapterTranslations } from './chapter-localization'
process.stdout.write(JSON.stringify(chapterTranslations.map((chapter, i) => ({
  chapter: i + 1, title: chapter.title
}))))
