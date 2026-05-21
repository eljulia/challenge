-- Synthetic challenge seed data. These users and articles are fake.

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change_token,
  reauthentication_token
) values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo.a@example.test',
    crypt('Challenge123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo User A"}',
    '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo.b@example.test',
    crypt('Challenge123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo User B"}',
    '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-0000000000c3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo.c@example.test',
    crypt('Challenge123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo User C"}',
    '', '', '', '', '', '', ''
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  raw_user_meta_data = excluded.raw_user_meta_data,
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change = '',
  email_change_token_current = '',
  phone_change_token = '',
  reauthentication_token = '',
  updated_at = now();

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a1',
    '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"demo.a@example.test"}',
    'email',
    'demo.a@example.test',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000b2',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","email":"demo.b@example.test"}',
    'email',
    'demo.b@example.test',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000c3',
    '00000000-0000-0000-0000-0000000000c3',
    '{"sub":"00000000-0000-0000-0000-0000000000c3","email":"demo.c@example.test"}',
    'email',
    'demo.c@example.test',
    now(),
    now(),
    now()
  )
on conflict (provider, provider_id) do nothing;

insert into public.profiles (id, display_name, current_month_points, preferences, consents)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    'Demo User A',
    120,
    '{"challengeMode":true,"preferredTopics":["AI marketing","founder storytelling"],"contentTone":"Practical","postingFrequency":"3 posts/week","targetAudience":"Small business leaders","industry":"Marketing","region":["Global"],"preferredLanguage":"English","secondLanguage":"None","industries":["Marketing"],"keywords":["AI marketing","founder storytelling"],"fixedKeywords":[],"preferredKeywords":["AI marketing","founder storytelling"],"trustedMedia":[],"trustedSourceIds":[]}',
    '[]'
  ),
  (
    '00000000-0000-0000-0000-0000000000b2',
    'Demo User B',
    60,
    '{"challengeMode":true,"preferredTopics":["sales operations","customer retention"],"contentTone":"Opinionated","postingFrequency":"1 post/week","targetAudience":"Revenue leaders","industry":"SaaS","region":["Global"],"preferredLanguage":"English","secondLanguage":"None","industries":["SaaS"],"keywords":["sales operations","customer retention"],"fixedKeywords":[],"preferredKeywords":["sales operations","customer retention"],"trustedMedia":[],"trustedSourceIds":[]}',
    '[]'
  ),
  (
    '00000000-0000-0000-0000-0000000000c3',
    'Demo User C',
    0,
    '{"challengeMode":true,"preferredTopics":["local services","automation"],"contentTone":"Warm","postingFrequency":"5 posts/week","targetAudience":"Operators","industry":"Services","region":["Global"],"preferredLanguage":"English","secondLanguage":"None","industries":["Services"],"keywords":["local services","automation"],"fixedKeywords":[],"preferredKeywords":["local services","automation"],"trustedMedia":[],"trustedSourceIds":[]}',
    '[]'
  )
on conflict (id) do update set
  display_name = excluded.display_name,
  current_month_points = excluded.current_month_points,
  preferences = excluded.preferences,
  updated_at = now();

insert into public.sources (id, name, apiurl, type, language, industries, locations, article_extraction_hints)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo Business Review', 'https://example.test/business', 'recommended', 'English', array['Marketing'], array['Global'], '{}'),
  ('22222222-2222-2222-2222-222222222222', 'Local Ops Weekly', 'https://example.test/ops', 'recommended', 'English', array['Services'], array['Global'], '{}')
on conflict (id) do update set
  name = excluded.name,
  apiurl = excluded.apiurl,
  type = excluded.type;

insert into public.articles (
  id,
  title,
  url,
  summary,
  content,
  imageurl,
  sourceid,
  publicationdate,
  retrievedat,
  article_language,
  industries,
  keywords,
  locations
) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'How AI Is Changing Small Business Marketing',
    'https://example.test/articles/ai-small-business-marketing',
    'A practical look at how small teams are using AI to speed up campaigns without losing their voice.',
    'Small businesses are using AI to draft campaign briefs, summarize customer interviews, and test messaging faster. The best teams still keep humans in the loop for judgment and brand voice.',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&auto=format&fit=crop',
    '11111111-1111-1111-1111-111111111111',
    '2026-05-01',
    now(),
    'English',
    array['Marketing'],
    array['AI marketing','small business'],
    '["Global"]'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'The Founder Guide to Writing Useful LinkedIn Posts',
    'https://example.test/articles/founder-linkedin-posts',
    'A short guide to turning customer lessons into posts that feel specific and useful.',
    'Founders often have the best raw material for LinkedIn content: customer conversations, mistakes, pricing lessons, and hiring decisions. The challenge is turning those moments into clear, generous writing.',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&auto=format&fit=crop',
    '11111111-1111-1111-1111-111111111111',
    '2026-05-03',
    now(),
    'English',
    array['Marketing'],
    array['founder storytelling','LinkedIn'],
    '["Global"]'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Why Customer Retention Starts Before Onboarding',
    'https://example.test/articles/retention-before-onboarding',
    'Retention improves when sales, success, and product agree on expectations before the customer signs.',
    'Retention is not only a customer-success metric. It starts when a sales team frames the problem accurately and a product team understands what the buyer expects to change after purchase.',
    'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1200&auto=format&fit=crop',
    '22222222-2222-2222-2222-222222222222',
    '2026-05-05',
    now(),
    'English',
    array['SaaS'],
    array['customer retention','sales operations'],
    '["Global"]'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'Automation Ideas for Local Service Businesses',
    'https://example.test/articles/local-service-automation',
    'Examples of simple automation that save owners time without making customers feel ignored.',
    'Local service businesses can automate reminders, estimates, review requests, and follow-ups. The best systems feel like thoughtful operations, not a wall between the customer and the team.',
    'https://images.unsplash.com/photo-1556761175-4b46a572b786?w=1200&auto=format&fit=crop',
    '22222222-2222-2222-2222-222222222222',
    '2026-05-07',
    now(),
    'English',
    array['Services'],
    array['automation','local services'],
    '["Global"]'
  )
on conflict (id) do update set
  title = excluded.title,
  url = excluded.url,
  summary = excluded.summary,
  content = excluded.content,
  imageurl = excluded.imageurl,
  sourceid = excluded.sourceid,
  publicationdate = excluded.publicationdate,
  retrievedat = excluded.retrievedat,
  article_language = excluded.article_language,
  industries = excluded.industries,
  keywords = excluded.keywords,
  locations = excluded.locations;
