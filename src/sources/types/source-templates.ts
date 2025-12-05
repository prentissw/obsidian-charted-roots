/**
 * Source Templates
 *
 * Built-in markdown templates for each source type.
 * Templates use {{title}} as a placeholder for the source title.
 */

/**
 * Default template used when no specific template is defined
 */
export const DEFAULT_SOURCE_TEMPLATE = `
# {{title}}

## Transcription


## Research Notes

`;

/**
 * Templates for built-in source types
 */
export const SOURCE_TEMPLATES: Record<string, string> = {
	vital_record: `
# {{title}}

## Document Information

| Field | Value |
|-------|-------|
| Event type |  |
| Event date |  |
| Event place |  |
| Certificate number |  |
| Registration date |  |

## People Named

-

## Transcription


## Research Notes


---
> [!tip] Media naming convention
> For vital records, use: \`{Year}-{Type}-{Surname}-{Location}.jpg\`
> Example: \`1895-birth-Smith-Brooklyn.jpg\` or \`1920-marriage-Jones-Manhattan.jpg\`
`,

	obituary: `
# {{title}}

## Publication Details

| Field | Value |
|-------|-------|
| Newspaper |  |
| Publication date |  |
| Page/section |  |

## Biographical Details

| Field | Value |
|-------|-------|
| Full name |  |
| Birth date |  |
| Death date |  |
| Burial place |  |

## Family Members Mentioned

-

## Transcription


## Research Notes

`,

	census: `
# {{title}}

## Census Information

| Field | Value |
|-------|-------|
| Census year |  |
| State/country |  |
| County |  |
| Township/city |  |
| Enumeration district |  |
| Sheet/page |  |
| Dwelling number |  |
| Family number |  |

## Household Members

| Name | Relation | Age | Birthplace | Occupation |
|------|----------|-----|------------|------------|
|  |  |  |  |  |

## Transcription


## Research Notes


---
> [!tip] Media naming convention
> For census images, use: \`{Year}-{State}-{County}-{Surname}-pg{Page}.jpg\`
> Example: \`1900-NY-Kings-Smith-pg42.jpg\`
`,

	church_record: `
# {{title}}

## Record Information

| Field | Value |
|-------|-------|
| Record type |  |
| Church name |  |
| Parish/diocese |  |
| Date of event |  |
| Date of record |  |

## People Named

| Role | Name |
|------|------|
| Subject |  |
| Parents |  |
| Sponsors/witnesses |  |
| Officiant |  |

## Transcription


## Research Notes

`,

	court_record: `
# {{title}}

## Case Information

| Field | Value |
|-------|-------|
| Court |  |
| Case number |  |
| Case type |  |
| Filing date |  |
| Judgment date |  |

## Parties Involved

| Role | Name |
|------|------|
| Plaintiff |  |
| Defendant |  |
| Witnesses |  |
| Judge |  |

## Transcription


## Research Notes

`,

	land_deed: `
# {{title}}

## Deed Information

| Field | Value |
|-------|-------|
| Deed type |  |
| Book/volume |  |
| Page |  |
| Record date |  |
| Consideration |  |

## Parties

| Role | Name |
|------|------|
| Grantor |  |
| Grantee |  |
| Witnesses |  |

## Property Description


## Transcription


## Research Notes

`,

	probate: `
# {{title}}

## Probate Information

| Field | Value |
|-------|-------|
| Record type |  |
| Court |  |
| Case/file number |  |
| Date of document |  |
| Date of probate |  |

## Deceased

| Field | Value |
|-------|-------|
| Full name |  |
| Death date |  |
| Residence |  |

## Beneficiaries/Heirs

| Name | Relationship | Bequest |
|------|--------------|---------|
|  |  |  |

## Estate Inventory


## Transcription


## Research Notes

`,

	military: `
# {{title}}

## Service Information

| Field | Value |
|-------|-------|
| Record type |  |
| Branch |  |
| Rank |  |
| Unit |  |
| Service dates |  |
| Service number |  |

## Servicemember

| Field | Value |
|-------|-------|
| Full name |  |
| Birth date |  |
| Birth place |  |
| Residence at enlistment |  |

## Transcription


## Research Notes

`,

	immigration: `
# {{title}}

## Voyage/Record Information

| Field | Value |
|-------|-------|
| Record type |  |
| Ship name |  |
| Departure port |  |
| Departure date |  |
| Arrival port |  |
| Arrival date |  |

## Passenger/Subject

| Field | Value |
|-------|-------|
| Full name |  |
| Age |  |
| Nationality |  |
| Last residence |  |
| Destination |  |
| Traveling companions |  |

## Transcription


## Research Notes

`,

	photo: `
# {{title}}

## Photo Information

| Field | Value |
|-------|-------|
| Photo type |  |
| Photographer/studio |  |
| Approximate date |  |
| Location |  |
| Format/size |  |

## People Identified

| Position | Name | Identification basis |
|----------|------|---------------------|
|  |  |  |

## Physical Description


## Research Notes


---
> [!tip] Media naming convention
> For photos, use: \`{Surname}-{Year}-{Location}-{Description}.jpg\`
> Example: \`Smith-1920-Brooklyn-wedding.jpg\`
`,

	correspondence: `
# {{title}}

## Letter Information

| Field | Value |
|-------|-------|
| Date written |  |
| Date postmarked |  |
| From |  |
| To |  |
| Location sent from |  |

## People Mentioned

-

## Transcription


## Research Notes

`,

	newspaper: `
# {{title}}

## Article Information

| Field | Value |
|-------|-------|
| Newspaper |  |
| Publication date |  |
| Page |  |
| Column |  |
| Article type |  |

## People Mentioned

-

## Transcription


## Research Notes

`,

	oral_history: `
# {{title}}

## Interview Information

| Field | Value |
|-------|-------|
| Interviewee |  |
| Interviewer |  |
| Date |  |
| Location |  |
| Recording format |  |
| Duration |  |

## Topics Covered

-

## People Mentioned

-

## Transcription


## Research Notes

`,

	custom: `
# {{title}}

## Source Details


## Transcription


## Research Notes

`
};

/**
 * Get the template for a source type
 */
export function getSourceTemplate(typeId: string, customTemplates?: Record<string, string>): string {
	// Check custom templates first
	if (customTemplates?.[typeId]) {
		return customTemplates[typeId];
	}

	// Check built-in templates
	if (SOURCE_TEMPLATES[typeId]) {
		return SOURCE_TEMPLATES[typeId];
	}

	// Fall back to default
	return DEFAULT_SOURCE_TEMPLATE;
}

/**
 * Apply template placeholders
 */
export function applyTemplatePlaceholders(template: string, data: { title: string }): string {
	return template.replace(/\{\{title\}\}/g, data.title);
}
