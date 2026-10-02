# GrowLocal measurement plan

GrowLocal uses a small first-party event layer so the audit funnel can be measured without adding cookies, a third-party analytics request or personal information to the browser queue. Events stay in memory until a consented provider is connected. If a future provider exposes `window.dataLayer`, events are forwarded there for that page session.

## Events

| Event | Properties | Trigger | Primary use |
| --- | --- | --- | --- |
| `cta_clicked` | `location`, `label`, `cta`, UTM context | A tracked CTA is clicked | Compare entry points |
| `audit_form_started` | `form_type`, UTM context | First focus in the audit form | Measure form intent |
| `audit_request_submitted` | `form_type`, UTM context | A valid audit request is sent | Measure submit intent |
| `audit_request_completed` | `form_type`, UTM context | The API confirms a saved request | Primary conversion |
| `audit_request_failed` | `form_type`, `status`, UTM context | The request returns an error | Diagnose friction |

The successful API response is the conversion point. Connect a provider only after its consent, retention and access settings are agreed. Never add email addresses, names, business names or free-text form values to event properties.
