export interface Channel {
  id: string;
  name: string;
  url: string;
  originalUrl?: string;
  logo: string;
  isUnstable: boolean;
  isFavorite: boolean;
  epgId: string;
  group: string;
}

export interface LiveTVSettings {
  // Reserved for future settings
}

export interface Program {
  id: string;
  channelId: string;
  start: string; // ISO string
  stop: string; // ISO string
  title: string;
  desc: string;
}

export interface EPGSource {
  id: string;
  name: string;
  url: string;
  region: string;
}

export const EPG_SOURCES: EPGSource[] = [
  { id: 'us', name: 'United States', url: 'https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml.gz', region: 'US' },
  { id: 'uk', name: 'United Kingdom', url: 'https://iptv-org.github.io/epg/guides/uk/sky.com.epg.xml.gz', region: 'UK' },
  { id: 'ca', name: 'Canada', url: 'https://iptv-org.github.io/epg/guides/ca/tvpassport.com.epg.xml.gz', region: 'CA' },
  { id: 'au', name: 'Australia', url: 'https://iptv-org.github.io/epg/guides/au/foxtel.com.au.epg.xml.gz', region: 'AU' },
  { id: 'de', name: 'Germany', url: 'https://iptv-org.github.io/epg/guides/de/hd-plus.de.epg.xml.gz', region: 'DE' },
  { id: 'fr', name: 'France', url: 'https://iptv-org.github.io/epg/guides/fr/programme-tv.net.epg.xml.gz', region: 'FR' },
];
