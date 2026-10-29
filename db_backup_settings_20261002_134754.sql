--
-- PostgreSQL database dump
--

\restrict BhEWifqhIXDP2uacubZYEOpbgAdNawNDQ3ecmK08VlbeEqb55zLV54QWIOqiv6X

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: admin_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_settings (id, settings, updated_at, updated_by) FROM stdin;
c4df71cc-4be8-4df9-a4bc-f4ca75d2162e	{"nvdFetchTime": "16:00", "engineEnabled": true, "highThreshold": 7, "engineSchedule": "daily", "certInFetchTime": "16:00", "mediumThreshold": 4, "cveSourceEnabled": true, "criticalThreshold": 9, "certInSourceEnabled": true, "notificationsEnabled": true}	2026-09-21 10:23:01.289+00	24f25cf2-e46a-4b35-a3eb-5bd42a598972
\.


--
-- Data for Name: user_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_settings (id, user_id, org_name, email_id, notification_level, created_at, email_enabled, severities, digest_frequency, cron_schedule_type, cron_time, cron_day) FROM stdin;
59610268-1a63-40b1-b95e-bfb5b1a587ca	d350db4f-89ba-4a95-a70e-7292fe8efb60	Aishan	hemanth.k@aishan.in	none	2026-09-07 12:19:16.123601+00	f	{Critical,High}	daily	immediate	\N	\N
1aa19e12-624a-4421-ad97-07fc57722b01	9b531c46-3e2f-4489-910b-b3964ab91f2b	Avotrix	vignesh@avotrix.com	all	2026-08-05 16:11:45.671682+00	t	{Critical,High,Medium,Low}	daily	immediate	\N	\N
f2dd46d8-831f-4c48-a1a6-72fd067b6e32	7a271064-ba97-4672-8f97-57b7e33365ed	Avotrix	nikhil.patrimath@avotrix.com	all	2026-08-17 10:08:27.881153+00	t	{Critical,High,Medium,Low}	daily	immediate	\N	\N
c7f0900f-9264-4d43-929a-5f3ba4b12a56	24f25cf2-e46a-4b35-a3eb-5bd42a598972	Avotrix	chetan.patidar@avotrix.com	all	2026-07-20 13:27:45.409271+00	t	{Critical,High,Medium,Low}	immediate	immediate	06:15_PM	friday
\.


--
-- PostgreSQL database dump complete
--

\unrestrict BhEWifqhIXDP2uacubZYEOpbgAdNawNDQ3ecmK08VlbeEqb55zLV54QWIOqiv6X

