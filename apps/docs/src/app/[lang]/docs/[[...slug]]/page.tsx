import { getPageImageUrl, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { gitConfig } from '@/lib/shared';
import { DOCS_LAST_VISITED_COOKIE } from '@/lib/docs-last-visited';

/**
 * Where bare `/[lang]/docs` (no `index.mdx` in either locale, see `Page`
 * below) should land: wherever `DocsLastVisitedTracker` last recorded for
 * this language, or `getting-started` on a first visit / after switching
 * language (the cookie value is only trusted when it's under this exact
 * `[lang]` prefix, so it never bounces you into the other locale's page).
 */
async function docsHomeRedirectTarget(lang: string): Promise<string> {
  const store = await cookies();
  const lastVisited = store.get(DOCS_LAST_VISITED_COOKIE)?.value;
  const prefix = `/${lang}/docs/`;
  if (lastVisited && lastVisited.startsWith(prefix)) return lastVisited;
  return `/${lang}/docs/getting-started`;
}

export default async function Page(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) {
    // `/docs` itself (empty slug) has no `index.mdx` in either locale --
    // land wherever the user last was instead of 404ing, which is what
    // every "Docs" link in the app (e.g. `IdeActivityBar`) points at.
    if (!params.slug?.length)
      redirect(await docsHomeRedirectTarget(params.lang));
    notFound();
  }

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) {
    if (!params.slug?.length)
      redirect(await docsHomeRedirectTarget(params.lang));
    notFound();
  }

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}
