/******************************** running-date.ts ******************************
 *
 * Purpose: The date that headers and footers print (`date` material, `{date}`
 *   in a header / footer fence): the document's own front-matter `date:` when
 *   it has one — a letter keeps the date it was written on — else today's.
 * How: the render pipeline sets it once per document (setDocumentDate) before
 *   rendering; every running-date writer reads runningDateText().
 *
 *******************************************************************************/

let documentDate: string | undefined;

/** The document's front-matter date (blank / absent → today's date). */
export function setDocumentDate(date: string | undefined): void {
  const d = date?.trim();
  documentDate = d ? d : undefined;
}

/** The date to print in a header / footer. */
export function runningDateText(): string {
  return (
    documentDate ??
    new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())
  );
}
