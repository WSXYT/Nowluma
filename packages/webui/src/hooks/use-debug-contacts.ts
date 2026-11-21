import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useT } from '@/i18n';
import { useApi } from '@/lib/api';
import { createContactList, contactErrorMessage, type ContactKind } from '@/lib/debug-contacts';

export { userAvatar, groupAvatar } from '@/lib/debug-contacts';

function useContactList(kind: ContactKind, uin: string, groupId = '') {
    const t = useT();
    const api = useApi();
    const store = useMemo(
        () => createContactList(api.debug.invoke, kind, uin, groupId),
        [api, kind, uin, groupId],
    );
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

    useEffect(() => {
        void store.refresh(false);
        return store.invalidate;
    }, [store]);

    return {
        ...state,
        error: contactErrorMessage(state.error, t),
        refresh: () => void store.refresh(),
    };
}

export function useFriends(uin: string) {
    return useContactList('friends', uin);
}

export function useGroups(uin: string) {
    return useContactList('groups', uin);
}

export function useGroupMembers(uin: string, groupId: string) {
    return useContactList('members', uin, groupId.trim());
}
