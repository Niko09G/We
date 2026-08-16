-- Lobby page configuration stored in app_settings (key: lobby_settings).
-- Run after app_settings.sql.

insert into public.app_settings (key, value)
values (
  'lobby_settings',
  '{
    "hero": {
      "title": "Welcome",
      "description": "Find your spot, explore the program, and join your table for the celebration.",
      "cta_find_seat_label": "Find My Seat",
      "cta_program_label": "See the Program"
    },
    "modules_order": ["seat-finder", "event-program", "mcs", "teams"],
    "modules": {
      "seat-finder": {
        "enabled": true,
        "title": "Find your seat",
        "description": null
      },
      "event-program": {
        "enabled": true,
        "title": "Event Program",
        "description": null
      },
      "mcs": {
        "enabled": true,
        "title": "Meet the MCs",
        "description": null
      },
      "teams": {
        "enabled": true,
        "title": "Teams",
        "description": "Your table reflects your team. See where you belong in the Seat Finder."
      }
    },
    "event_program": [],
    "mcs": [
      {
        "id": "mc1",
        "name": "MC One",
        "description": "Your host for the evening.",
        "photo_url": null
      },
      {
        "id": "mc2",
        "name": "MC Two",
        "description": "Keeping the energy high all night.",
        "photo_url": null
      }
    ]
  }'::jsonb
)
on conflict (key) do nothing;
