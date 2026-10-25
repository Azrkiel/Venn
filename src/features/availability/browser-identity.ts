const VALID_KEY = /^[A-Za-z0-9_-]{43}$/;

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** IndexedDB serializes this read/write across tabs before the first HTTP-only cookie exists. */
export async function browserGuestKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('venn-availability', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('identity'); };
    open.onerror = () => reject(new Error('Allow browser storage so Venn can save and update your answer.'));
    open.onblocked = () => reject(new Error('Close older Venn tabs, then try saving again.'));
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('identity', 'readwrite');
      const store = transaction.objectStore('identity');
      const read = store.get('guest');
      let key: string;
      read.onsuccess = () => {
        key = typeof read.result === 'string' && VALID_KEY.test(read.result) ? read.result : newKey();
        if (key !== read.result) store.put(key, 'guest');
      };
      transaction.oncomplete = () => { db.close(); resolve(key); };
      transaction.onerror = transaction.onabort = () => {
        db.close(); reject(new Error('Allow browser storage so Venn can save and update your answer.'));
      };
    };
  });
}
