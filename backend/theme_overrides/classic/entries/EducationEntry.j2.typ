{% set first_row_lines = 1 %}
#education-entry(
  [
{% for line in entry.main_column.splitlines()[:first_row_lines] %}
    {{ line|indent(4) }}

{% endfor %}
  ],
  [
{% for line in entry.date_and_location_column.splitlines() %}
    {{ line|indent(4) }}

{% endfor %}
  ],
{% if design.templates.education_entry.degree_column %}
  degree-column: [
    {{ entry.degree_column|indent(4) }}
  ],
{% endif %}
  main-column-second-row: [
{% for line in entry.main_column.splitlines()[first_row_lines:] %}
    {{ line|indent(4) }}

{% endfor %}
  ],
)
