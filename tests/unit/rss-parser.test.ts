import { describe, it, expect } from 'vitest';
import { parseRSSItems, extractTag, extractEnclosureUrl } from '../../src/data/loaders/substack-loader';

describe('extractTag', () => {
  it('extracts plain text content', () => {
    const xml = '<title>Hello World</title>';
    expect(extractTag(xml, 'title')).toBe('Hello World');
  });

  it('extracts CDATA-wrapped content', () => {
    const xml = '<content:encoded><![CDATA[<p>Rich content</p>]]></content:encoded>';
    expect(extractTag(xml, 'content:encoded')).toBe('<p>Rich content</p>');
  });

  it('returns empty string for non-existent tags', () => {
    const xml = '<title>Test</title>';
    expect(extractTag(xml, 'description')).toBe('');
  });

  it('trims whitespace', () => {
    const xml = '<title>  spaced  </title>';
    expect(extractTag(xml, 'title')).toBe('spaced');
  });

  it('handles tags with attributes', () => {
    const xml = '<title type="text">Attributed</title>';
    expect(extractTag(xml, 'title')).toBe('Attributed');
  });
});

describe('extractEnclosureUrl', () => {
  it('extracts url from enclosure tag', () => {
    const xml = '<enclosure url="https://example.com/image.jpg" type="image/jpeg" />';
    expect(extractEnclosureUrl(xml)).toBe('https://example.com/image.jpg');
  });

  it('returns undefined when no enclosure', () => {
    const xml = '<title>No enclosure here</title>';
    expect(extractEnclosureUrl(xml)).toBeUndefined();
  });
});

describe('parseRSSItems', () => {
  it('parses well-formed item with all fields', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title>Test Post</title>
            <link>https://example.com/p/test-post</link>
            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
            <description>A test description</description>
            <content:encoded><![CDATA[<p>Full content</p>]]></content:encoded>
            <dc:creator>Author Name</dc:creator>
            <enclosure url="https://example.com/thumb.jpg" type="image/jpeg" />
          </item>
        </channel>
      </rss>
    `;
    const items = parseRSSItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: 'Test Post',
      link: 'https://example.com/p/test-post',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      description: 'A test description',
      content: '<p>Full content</p>',
      author: 'Author Name',
      thumbnail: 'https://example.com/thumb.jpg',
    });
  });

  it('handles missing optional fields gracefully', () => {
    const xml = `
      <rss><channel>
        <item>
          <title>Minimal Post</title>
          <link>https://example.com/p/minimal</link>
        </item>
      </channel></rss>
    `;
    const items = parseRSSItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Minimal Post');
    expect(items[0].description).toBe('');
    expect(items[0].content).toBe('');
    expect(items[0].author).toBe('');
    expect(items[0].thumbnail).toBeUndefined();
  });

  it('parses multiple items', () => {
    const xml = `
      <rss><channel>
        <item><title>First</title><link>https://a.com/1</link></item>
        <item><title>Second</title><link>https://a.com/2</link></item>
        <item><title>Third</title><link>https://a.com/3</link></item>
      </channel></rss>
    `;
    const items = parseRSSItems(xml);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('returns empty array for empty XML', () => {
    expect(parseRSSItems('')).toEqual([]);
    expect(parseRSSItems('<rss><channel></channel></rss>')).toEqual([]);
  });
});
