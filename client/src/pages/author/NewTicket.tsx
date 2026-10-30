import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Send, X } from 'lucide-react';
import { Button, Card, ErrorBanner, Field, inputCls, PageHeader } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { fileSize } from '../../lib/format';
import { markOwnAction } from '../../lib/realtime';
import { useToast } from '../../lib/toast';
import type { AuthorTicket, Book } from '../../lib/types';

const MAX_DESC = 4000;
const MAX_FILES = 5;
const MAX_BYTES = 25 * 1024 * 1024;

export default function NewTicket() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const books = useQuery({ queryKey: ['books'], queryFn: () => api.get<{ data: Book[] }>('/books').then((r) => r.data) });
  const [bookId, setBookId] = useState(params.get('bookId') ?? '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      api.post<{ data: AuthorTicket }>('/tickets', {
        bookId: bookId || null,
        subject,
        description,
        attachments: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      }),
    onMutate: () => markOwnAction(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.push({ tone: 'success', title: `Ticket ${r.data.ticketId} submitted`, body: "We'll reply here as soon as we can." });
      navigate(`/tickets/${r.data.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else toast.push({ tone: 'error', title: 'Could not submit your query', body: e instanceof Error ? e.message : undefined });
    },
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) setFileError(`${f.name} is larger than 25 MB.`);
      else if (next.length >= MAX_FILES) setFileError(`You can attach up to ${MAX_FILES} files.`);
      else next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = '';
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (subject.trim().length < 3) errs.subject = 'Please add a short subject (at least 3 characters).';
    if (description.trim().length < 10) errs.description = 'Please describe the issue in at least 10 characters.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate();
  }

  return (
    <>
      <PageHeader title="Submit a query" subtitle="Tell us what's going on and we'll get back to you here." />
      <Card className="max-w-3xl">
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6" noValidate>
          <Field label="Which book is this about?" htmlFor="book" hint="Choose “General / Account Level” for anything that isn't about one specific title.">
            <select id="book" className={inputCls} value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={books.isLoading}>
              <option value="">General / Account Level</option>
              {books.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subject" htmlFor="subject" error={errors.subject}>
            <input id="subject" className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} placeholder="e.g. Royalty for last quarter hasn't arrived" />
          </Field>

          <Field label="Describe your issue" htmlFor="description" error={errors.description} hint={<span className="tabular-nums">{description.length} / {MAX_DESC}</span>}>
            <textarea id="description" rows={7} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={MAX_DESC} placeholder="Include dates, amounts or anything else that helps us look into it." />
          </Field>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Attachments <span className="font-normal text-muted">(optional)</span></span>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <Button type="button" variant="secondary" size="sm" icon={<Paperclip className="size-4" />} onClick={() => fileInput.current?.click()}>
              Add file
            </Button>
            {fileError && <p className="mt-1.5 text-sm text-clay">{fileError}</p>}
            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-1.5 text-sm">
                    <span className="truncate">{f.name} <span className="text-muted">· {fileSize(f.size)}</span></span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ml-2 text-faint hover:text-clay" aria-label={`Remove ${f.name}`}>
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-muted">Only the file names are recorded for now — file upload isn&apos;t enabled in this version.</p>
          </div>

          {create.isError && !Object.keys(errors).length && <ErrorBanner message={create.error instanceof Error ? create.error.message : 'Something went wrong.'} />}

          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <Link to="/tickets" className="text-sm font-medium text-muted hover:text-ink">Cancel</Link>
            <Button type="submit" loading={create.isPending} icon={<Send className="size-4" />}>Submit query</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
