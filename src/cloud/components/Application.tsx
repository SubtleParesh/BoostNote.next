import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { usePreferences } from '../lib/stores/preferences'
import { usePage } from '../lib/stores/pageStore'
import {
  useGlobalKeyDownHandler,
  isSingleKeyEventOutsideOfInput,
  preventKeyboardEventPropagation,
  isSingleKeyEvent,
} from '../lib/keyboard'
import { isActiveElementAnInput, InputableDomElement } from '../lib/dom'
import { useDebounce, useEffectOnce } from 'react-use'
import { SettingsTab, useSettings } from '../lib/stores/settings'
import { shortcuts } from '../lib/shortcuts'
import { useSearch } from '../lib/stores/search'
import AnnouncementAlert from './atoms/AnnouncementAlert'
import {
  modalDiscountEventEmitter,
  modalImportEventEmitter,
  newFolderEventEmitter,
  searchEventEmitter,
  toggleSidebarSearchEventEmitter,
  toggleSidebarTimelineEventEmitter,
  toggleSidebarTreeEventEmitter,
} from '../lib/utils/events'
import { usePathnameChangeEffect, useRouter } from '../lib/router'
import { useNav } from '../lib/stores/nav'
import EventSource from './organisms/EventSource'
import ApplicationLayout from '../../shared/components/molecules/ApplicationLayout'
import Sidebar, {
  PopOverState,
} from '../../shared/components/organisms/Sidebar'
import { MenuTypes, useContextMenu } from '../../shared/lib/stores/contextMenu'
import { useGlobalData } from '../lib/stores/globalData'
import { getDocLinkHref } from './atoms/Link/DocLink'
import { getFolderHref } from './atoms/Link/FolderLink'
import {
  SidebarSearchHistory,
  SidebarSearchResult,
} from '../../shared/components/organisms/Sidebar/molecules/SidebarSearch'
import {
  SidebarState,
  SidebarTreeSortingOrders,
} from '../../shared/lib/sidebar'
import useApi from '../../shared/lib/hooks/useApi'
import {
  GetSearchResultsRequestQuery,
  getSearchResultsV2,
  HistoryItem,
  SearchResult,
} from '../api/search'
import { SidebarToolbarRow } from '../../shared/components/organisms/Sidebar/molecules/SidebarToolbar'
import { mapUsers } from '../../shared/lib/mappers/users'
import { SerializedDoc, SerializedDocWithBookmark } from '../interfaces/db/doc'
import { SerializedTeam } from '../interfaces/db/team'
import { compareDateString } from '../../shared/lib/date'
import {
  getDocTitle,
  getTeamURL,
  getOriginalDocId,
} from '../lib/utils/patterns'
import {
  mdiAccountMultiplePlusOutline,
  mdiClockOutline,
  mdiCogOutline,
  mdiDownload,
  mdiFileDocumentMultipleOutline,
  mdiFileDocumentOutline,
  mdiGiftOutline,
  mdiLogoutVariant,
  mdiMagnify,
  mdiPlusCircleOutline,
  mdiBell,
} from '@mdi/js'
import { getColorFromString } from '../../shared/lib/string'
import { buildIconUrl } from '../api/files'
import { SerializedFolder } from '../interfaces/db/folder'
import RoundedImage from '../../shared/components/atoms/RoundedImage'
import ImportModal from './organisms/Modal/contents/Import/ImportModal'
import { SerializedTeamInvite } from '../interfaces/db/teamInvite'
import { getHexFromUUID } from '../lib/utils/string'
import { stringify } from 'querystring'
import { sendToHost, useElectron, usingElectron } from '../lib/stores/electron'
import { SidebarSpace } from '../../shared/components/organisms/Sidebar/molecules/SidebarSpaces'
import ContentLayout, {
  ContentLayoutProps,
} from '../../shared/components/templates/ContentLayout'
import { getTeamLinkHref } from './atoms/Link/TeamLink'
import cc from 'classcat'
import { useCloudResourceModals } from '../lib/hooks/useCloudResourceModals'
import { mapTopbarTree } from '../lib/mappers/topbarTree'
import FuzzyNavigation from '../../shared/components/organisms/FuzzyNavigation'
import {
  mapFuzzyNavigationItems,
  mapFuzzyNavigationRecentItems,
} from '../lib/mappers/fuzzyNavigation'
import { ModalOpeningOptions, useModal } from '../../shared/lib/stores/modal'
import NewDocButton from './molecules/NewDocButton'
import { useCloudSidebarTree } from '../lib/hooks/sidebar/useCloudSidebarTree'
import { SerializedSubscription } from '../interfaces/db/subscription'
import { isEligibleForDiscount } from '../lib/subscription'
import { trackEvent } from '../api/track'
import { MixpanelActionTrackTypes } from '../interfaces/analytics/mixpanel'
import DiscountModal from './organisms/Modal/contents/DiscountModal'
import { compareAsc } from 'date-fns'
import { Notification as UserNotification } from '../interfaces/db/notifications'
import useNotificationState from '../../shared/lib/hooks/useNotificationState'
import { useNotifications } from '../../shared/lib/stores/notifications'
import NotifyIcon from '../../shared/components/atoms/NotifyIcon'

interface ApplicationProps {
  content: ContentLayoutProps
  className?: string
  initialSidebarState?: SidebarState
}

const Application = ({
  content: { topbar, ...content },
  children,
  initialSidebarState,
}: React.PropsWithChildren<ApplicationProps>) => {
  const { preferences, setPreferences } = usePreferences()
  const {
    initialLoadDone,
    docsMap,
    foldersMap,
    workspacesMap,
    currentParentFolderId,
    currentWorkspaceId,
    appEventsMap,
  } = useNav()
  const {
    team,
    permissions = [],
    currentUserPermissions,
    subscription,
    currentUserIsCoreMember,
  } = usePage()
  const { openModal } = useModal()
  const {
    globalData: { teams, invites, currentUser },
  } = useGlobalData()
  const { push, query, pathname, goBack, goForward } = useRouter()
  const { history, searchHistory, addToSearchHistory } = useSearch()
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [popOverState, setPopOverState] = useState<PopOverState>(null)
  const [searchResults, setSearchResults] = useState<SidebarSearchResult[]>([])
  const [sidebarState, setSidebarState] = useState<SidebarState | undefined>(
    initialSidebarState != null
      ? initialSidebarState
      : preferences.lastSidebarState
  )
  const { openSettingsTab, closeSettingsTab } = useSettings()
  const { usingElectron, sendToElectron } = useElectron()
  const { openNewFolderForm } = useCloudResourceModals()
  const [showFuzzyNavigation, setShowFuzzyNavigation] = useState(false)
  const { popup } = useContextMenu()
  const { treeWithOrderedCategories } = useCloudSidebarTree()
  const { counts } = useNotifications()

  usePathnameChangeEffect(() => {
    setShowFuzzyNavigation(false)
  })

  useEffectOnce(() => {
    if (query.settings === 'upgrade') {
      openSettingsTab('teamUpgrade')
    }
  })

  useEffect(() => {
    setPreferences({ lastSidebarState: sidebarState })
  }, [sidebarState, setPreferences])

  useEffect(() => {
    const handler = () => {
      setShowFuzzyNavigation((prev) => !prev)
    }
    searchEventEmitter.listen(handler)
    return () => {
      searchEventEmitter.unlisten(handler)
    }
  }, [])

  const openState = useCallback((state: SidebarState) => {
    setSidebarState((prev) => (prev === state ? undefined : state))
  }, [])

  const sidebarResize = useCallback(
    (width: number) => setPreferences({ sideBarWidth: width }),
    [setPreferences]
  )

  const users = useMemo(() => {
    return mapUsers(permissions, currentUser)
  }, [permissions, currentUser])

  const toolbarRows: SidebarToolbarRow[] = useMemo(() => {
    return mapToolbarRows(
      popOverState,
      setPopOverState,
      openState,
      openModal,
      openSettingsTab,
      sidebarState,
      team,
      subscription,
      team != null ? counts[team.id] : 0
    )
  }, [
    sidebarState,
    openModal,
    openSettingsTab,
    team,
    openState,
    popOverState,
    subscription,
    counts,
  ])

  const topbarTree = useMemo(() => {
    if (team == null) {
      return undefined
    }

    return mapTopbarTree(
      team,
      initialLoadDone,
      docsMap,
      foldersMap,
      workspacesMap,
      push
    )
  }, [team, initialLoadDone, docsMap, foldersMap, workspacesMap, push])

  const spaces = useMemo(() => {
    return mapSpaces(push, teams, invites, counts, team)
  }, [teams, team, invites, push, counts])

  const historyItems = useMemo(() => {
    return mapHistory(history || [], push, docsMap, foldersMap, team)
  }, [team, history, push, docsMap, foldersMap])

  const setSearchQuery = useCallback((val: string) => {
    setSidebarSearchQuery(val)
  }, [])

  const { submit: submitSearch, sending: fetchingSearchResults } = useApi({
    api: ({ teamId, query }: { teamId: string; query: any }) =>
      getSearchResultsV2({ teamId, query }),
    cb: ({ results }) =>
      setSearchResults(mapSearchResults(results, push, team)),
  })

  const [isNotDebouncing, cancel] = useDebounce(
    async () => {
      if (team == null || sidebarSearchQuery.trim() === '') {
        return
      }

      if (fetchingSearchResults) {
        cancel()
      }

      const searchParams = sidebarSearchQuery
        .split(' ')
        .reduce<GetSearchResultsRequestQuery>(
          (params, str) => {
            if (str === '--body') {
              params.body = true
              return params
            }
            if (str === '--title') {
              params.title = true
              return params
            }
            params.query = params.query == '' ? str : `${params.query} ${str}`
            return params
          },
          { query: '' }
        )

      addToSearchHistory(searchParams.query)
      await submitSearch({ teamId: team.id, query: searchParams })
    },
    600,
    [sidebarSearchQuery]
  )

  const timelineRows = useMemo(() => {
    const appEvents = [...appEventsMap.values()].sort((a, b) =>
      compareAsc(new Date(a.createdAt), new Date(b.createdAt))
    )

    const docs: SerializedDocWithBookmark[] = []
    let count = 0
    for (const appEvent of appEvents) {
      const { resource } = appEvent.data || {}
      if (typeof resource !== 'string') {
        continue
      }
      const doc = docsMap.get(getOriginalDocId(resource))
      if (doc != null) {
        docs.push(doc)

        if (count++ > 20) {
          break
        }
      }
    }

    return mapTimelineItems(docs, push, team)
  }, [appEventsMap, docsMap, push, team])

  const openCreateFolderModal = useCallback(() => {
    openNewFolderForm({
      team,
      workspaceId: currentWorkspaceId,
      parentFolderId: currentParentFolderId,
    })
  }, [openNewFolderForm, currentParentFolderId, team, currentWorkspaceId])

  useEffect(() => {
    if (team == null || currentUserPermissions == null) {
      return
    }
    newFolderEventEmitter.listen(openCreateFolderModal)
    return () => {
      newFolderEventEmitter.unlisten(openCreateFolderModal)
    }
  }, [team, currentUserPermissions, openCreateFolderModal])

  const overrideBrowserCtrlsHandler = useCallback(
    async (event: KeyboardEvent) => {
      if (team == null) {
        return
      }

      if (isSingleKeyEventOutsideOfInput(event, shortcuts.teamMembers)) {
        preventKeyboardEventPropagation(event)
        openSettingsTab('teamMembers')
      }

      if (isSingleKeyEvent(event, 'escape') && isActiveElementAnInput()) {
        if (isCodeMirrorTextAreaEvent(event)) {
          return
        }
        preventKeyboardEventPropagation(event)
        ;(document.activeElement as InputableDomElement).blur()
      }
    },
    [openSettingsTab, team]
  )
  useGlobalKeyDownHandler(overrideBrowserCtrlsHandler)

  const toggleSidebarTree = useCallback(() => {
    closeSettingsTab()
    setSidebarState((prev) => {
      return prev === 'tree' ? undefined : 'tree'
    })
  }, [closeSettingsTab])
  useEffect(() => {
    toggleSidebarTreeEventEmitter.listen(toggleSidebarTree)
    return () => {
      toggleSidebarTreeEventEmitter.unlisten(toggleSidebarTree)
    }
  }, [toggleSidebarTree])

  const toggleSidebarSearch = useCallback(() => {
    closeSettingsTab()
    setSidebarState((prev) => {
      return prev === 'search' ? undefined : 'search'
    })
  }, [closeSettingsTab])
  useEffect(() => {
    toggleSidebarSearchEventEmitter.listen(toggleSidebarSearch)
    return () => {
      toggleSidebarSearchEventEmitter.unlisten(toggleSidebarSearch)
    }
  }, [toggleSidebarSearch])

  const toggleSidebarTimeline = useCallback(() => {
    closeSettingsTab()
    setSidebarState((prev) => {
      return prev === 'timeline' ? undefined : 'timeline'
    })
  }, [closeSettingsTab])
  useEffect(() => {
    toggleSidebarTimelineEventEmitter.listen(toggleSidebarTimeline)
    return () => {
      toggleSidebarTimelineEventEmitter.unlisten(toggleSidebarTimeline)
    }
  }, [toggleSidebarTimeline])

  const openImportModal = useCallback(() => {
    closeSettingsTab()
    openModal(<ImportModal />, { showCloseIcon: true })
  }, [closeSettingsTab, openModal])

  useEffect(() => {
    modalImportEventEmitter.listen(openImportModal)
    return () => {
      modalImportEventEmitter.unlisten(openImportModal)
    }
  }, [openImportModal])

  useEffect(() => {
    const openDiscountModal = () => {
      if (team == null) {
        return
      }
      trackEvent(MixpanelActionTrackTypes.UpgradeDiscount, { team: team.id })
      openModal(<DiscountModal />, { showCloseIcon: true, width: 'large' })
    }
    modalDiscountEventEmitter.listen(openDiscountModal)
    return () => {
      modalDiscountEventEmitter.unlisten(openDiscountModal)
    }
  }, [openModal, team])

  useEffect(() => {
    if (!usingElectron) {
      return
    }
    sendToElectron('sidebar--state', { state: sidebarState })
  }, [usingElectron, , sendToElectron, sidebarState])

  const {
    state: notificationState,
    getMore: getMoreNotifications,
    setViewed,
  } = useNotificationState(team?.id)
  const notificationClick = useCallback(
    (notification: UserNotification) => {
      setPopOverState(null)
      setViewed(notification)
      push(notification.link)
    },
    [push, setViewed]
  )

  return (
    <>
      {team != null && <EventSource teamId={team.id} />}
      {showFuzzyNavigation && team != null && (
        <FuzzyNavigation
          close={() => setShowFuzzyNavigation(false)}
          allItems={mapFuzzyNavigationItems(
            team,
            push,
            docsMap,
            foldersMap,
            workspacesMap
          )}
          recentItems={mapFuzzyNavigationRecentItems(
            team,
            history,
            push,
            docsMap,
            foldersMap,
            workspacesMap
          )}
        />
      )}
      <ApplicationLayout
        sidebar={
          <Sidebar
            className={cc(['application__sidebar'])}
            showToolbar={!usingElectron}
            popOver={popOverState}
            onSpacesBlur={() => setPopOverState(null)}
            toolbarRows={toolbarRows}
            spaces={spaces}
            spaceBottomRows={buildSpacesBottomRows(push)}
            sidebarExpandedWidth={preferences.sideBarWidth}
            sidebarState={sidebarState}
            tree={treeWithOrderedCategories}
            sidebarResize={sidebarResize}
            searchQuery={sidebarSearchQuery}
            setSearchQuery={setSearchQuery}
            searchHistory={searchHistory}
            recentPages={historyItems}
            treeControls={[
              {
                icon:
                  preferences.sidebarTreeSortingOrder === 'a-z'
                    ? SidebarTreeSortingOrders.aZ.icon
                    : preferences.sidebarTreeSortingOrder === 'z-a'
                    ? SidebarTreeSortingOrders.zA.icon
                    : preferences.sidebarTreeSortingOrder === 'last-updated'
                    ? SidebarTreeSortingOrders.lastUpdated.icon
                    : SidebarTreeSortingOrders.dragDrop.icon,
                onClick: (event) => {
                  popup(
                    event,
                    Object.values(SidebarTreeSortingOrders).map((sort) => {
                      return {
                        type: MenuTypes.Normal,
                        onClick: () =>
                          setPreferences({
                            sidebarTreeSortingOrder: sort.value,
                          }),
                        label: sort.label,
                        icon: sort.icon,
                        active:
                          sort.value === preferences.sidebarTreeSortingOrder,
                      }
                    })
                  )
                },
              },
            ]}
            treeTopRows={
              team != null && currentUserIsCoreMember ? (
                <NewDocButton team={team} />
              ) : null
            }
            searchResults={searchResults}
            users={users}
            timelineRows={timelineRows}
            timelineMore={
              team != null && pathname !== getTeamLinkHref(team, 'timeline')
                ? {
                    variant: 'primary',
                    onClick: () => push(getTeamLinkHref(team, 'timeline')),
                  }
                : undefined
            }
            sidebarSearchState={{
              fetching: fetchingSearchResults,
              isNotDebouncing: isNotDebouncing() === true,
            }}
            notificationState={notificationState}
            getMoreNotifications={getMoreNotifications}
            notificationClick={notificationClick}
          />
        }
        pageBody={
          <>
            <ContentLayout
              {...content}
              topbar={{
                ...topbar,
                tree: topbarTree,
                navigation: {
                  goBack,
                  goForward,
                },
              }}
            >
              {children}
            </ContentLayout>
          </>
        }
      />
      <AnnouncementAlert />
    </>
  )
}

export default Application

function mapTimelineItems(
  docs: SerializedDoc[],
  push: (url: string) => void,
  team?: SerializedTeam,
  limit = 10
) {
  if (team == null) {
    return []
  }

  return docs
    .sort((a, b) =>
      compareDateString(
        a.head?.created || a.updatedAt,
        b.head?.created || b.updatedAt,
        'DESC'
      )
    )
    .slice(0, limit)
    .map((doc) => {
      const labelHref = getDocLinkHref(doc, team, 'index')
      return {
        id: doc.id,
        label: getDocTitle(doc, 'Untitled'),
        labelHref,
        labelOnClick: () => push(labelHref),
        emoji: doc.emoji,
        defaultIcon: mdiFileDocumentOutline,
        lastUpdated: doc.head?.created || doc.updatedAt,
        lastUpdatedBy:
          doc.head == null
            ? []
            : (doc.head.creators || []).map((user) => {
                return {
                  color: getColorFromString(user.id),
                  userId: user.id,
                  name: user.displayName,
                  iconUrl:
                    user.icon != null
                      ? buildIconUrl(user.icon.location)
                      : undefined,
                }
              }),
      }
    })
}

function mapSearchResults(
  results: SearchResult[],
  push: (url: string) => void,
  team?: SerializedTeam
) {
  if (team == null) {
    return []
  }

  return results.reduce((acc, item) => {
    if (item.type === 'folder') {
      const href = `${process.env.BOOST_HUB_BASE_URL}${getFolderHref(
        item.result,
        team,
        'index'
      )}`
      acc.push({
        label: item.result.name,
        href,
        emoji: item.result.emoji,
        onClick: () => push(href),
      })
      return acc
    }

    const href = `${process.env.BOOST_HUB_BASE_URL}${getDocLinkHref(
      item.result,
      team,
      'index'
    )}`
    acc.push({
      label: getDocTitle(item.result, 'Untitled'),
      href,
      defaultIcon: mdiFileDocumentOutline,
      emoji: item.result.emoji,
      contexts: item.type === 'docContent' ? [item.context] : undefined,
      onClick: () => push(href),
    })
    return acc
  }, [] as SidebarSearchResult[])
}

function mapHistory(
  history: HistoryItem[],
  push: (href: string) => void,
  docsMap: Map<string, SerializedDoc>,
  foldersMap: Map<string, SerializedFolder>,
  team?: SerializedTeam
) {
  if (team == null) {
    return []
  }

  const items = [] as SidebarSearchHistory[]

  history.forEach((historyItem) => {
    if (historyItem.type === 'folder') {
      const item = foldersMap.get(historyItem.item)
      if (item != null) {
        const href = `${process.env.BOOST_HUB_BASE_URL}${getFolderHref(
          item,
          team,
          'index'
        )}`
        items.push({
          emoji: item.emoji,
          label: item.name,
          href,
          onClick: () => push(href),
        })
      }
    } else {
      const item = docsMap.get(historyItem.item)
      if (item != null) {
        const href = `${process.env.BOOST_HUB_BASE_URL}${getDocLinkHref(
          item,
          team,
          'index'
        )}`
        items.push({
          emoji: item.emoji,
          defaultIcon: mdiFileDocumentOutline,
          label: getDocTitle(item, 'Untitled'),
          href,
          onClick: () => push(href),
        })
      }
    }
  })

  return items
}

function mapToolbarRows(
  popOverState: PopOverState,
  setPopOverState: React.Dispatch<React.SetStateAction<PopOverState>>,
  openState: (sidebarState: SidebarState) => void,
  openModal: (cmp: JSX.Element, options?: ModalOpeningOptions) => void,
  openSettingsTab: (tab: SettingsTab) => void,
  sidebarState?: SidebarState,
  team?: SerializedTeam,
  subscription?: SerializedSubscription,
  newNotifications?: number
) {
  const rows: SidebarToolbarRow[] = []
  if (team != null) {
    rows.push({
      tooltip: 'Spaces',
      active: popOverState === 'spaces',
      icon: (
        <RoundedImage
          size={26}
          alt={team.name}
          url={team.icon != null ? buildIconUrl(team.icon.location) : undefined}
        />
      ),
      onClick: () =>
        setPopOverState((prev) => (prev === 'spaces' ? null : 'spaces')),
    })
  }
  rows.push({
    tooltip: 'Tree',
    active: sidebarState === 'tree',
    icon: mdiFileDocumentMultipleOutline,
    onClick: () => openState('tree'),
  })
  rows.push({
    tooltip: 'Search',
    active: sidebarState === 'search',
    icon: mdiMagnify,
    onClick: () => openState('search'),
  })
  rows.push({
    tooltip: 'Timeline',
    active: sidebarState === 'timeline',
    icon: mdiClockOutline,
    onClick: () => openState('timeline'),
  })
  rows.push({
    tooltip: 'Notifications',
    active: popOverState === 'notifications',
    icon: newNotifications ? <NotifyIcon path={mdiBell} /> : mdiBell,
    onClick: () => {
      if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
      setPopOverState((prev) =>
        prev === 'notifications' ? null : 'notifications'
      )
    },
  })

  if (team != null && subscription == null && isEligibleForDiscount(team)) {
    rows.push({
      position: 'bottom',
      tooltip: 'Get the new user discount!',
      icon: mdiGiftOutline,
      pelletVariant: 'danger',
      onClick: () => {
        trackEvent(MixpanelActionTrackTypes.UpgradeDiscount, { team: team.id })
        openModal(<DiscountModal />, { showCloseIcon: true, width: 'large' })
      },
    })
  }

  rows.push({
    tooltip: 'Import',
    icon: mdiDownload,
    position: 'bottom',
    onClick: () => openModal(<ImportModal />, { showCloseIcon: true }),
  })
  rows.push({
    tooltip: 'Members',
    active: sidebarState === 'members',
    icon: mdiAccountMultiplePlusOutline,
    position: 'bottom',
    onClick: () => openSettingsTab('teamMembers'),
  })
  rows.push({
    tooltip: 'Settings',
    active: sidebarState === 'settings',
    icon: mdiCogOutline,
    position: 'bottom',
    onClick: () => openSettingsTab('preferences'),
  })

  return rows
}

function mapSpaces(
  push: (url: string) => void,
  teams: SerializedTeam[],
  invites: SerializedTeamInvite[],
  counts: Record<string, number>,
  team?: SerializedTeam
) {
  const rows: SidebarSpace[] = []
  teams.forEach((globalTeam) => {
    const href = `${process.env.BOOST_HUB_BASE_URL}${getTeamURL(globalTeam)}`
    rows.push({
      label: globalTeam.name,
      active: team?.id === globalTeam.id,
      notificationCount: counts[globalTeam.id],
      icon:
        globalTeam.icon != null
          ? buildIconUrl(globalTeam.icon.location)
          : undefined,
      linkProps: {
        href,
        onClick: (event: React.MouseEvent) => {
          event.preventDefault()
          push(href)
        },
      },
    })
  })

  invites.forEach((invite) => {
    const query = { t: invite.team.id, i: getHexFromUUID(invite.id) }
    const href = `${process.env.BOOST_HUB_BASE_URL}/invite?${stringify(query)}`
    rows.push({
      label: `${invite.team.name} (invited)`,
      icon:
        invite.team.icon != null
          ? buildIconUrl(invite.team.icon.location)
          : undefined,
      linkProps: {
        href,
        onClick: (event: React.MouseEvent) => {
          event.preventDefault()
          push(`/invite?${stringify(query)}`)
        },
      },
    })
  })

  return rows
}

function buildSpacesBottomRows(push: (url: string) => void) {
  return [
    {
      label: 'Create an account',
      icon: mdiPlusCircleOutline,
      linkProps: {
        href: `${process.env.BOOST_HUB_BASE_URL}/cooperate`,
        onClick: (event: React.MouseEvent) => {
          event.preventDefault()
          push(`/cooperate`)
        },
      },
    },
    {
      label: 'Download desktop app',
      icon: mdiDownload,
      linkProps: {
        href: 'https://github.com/BoostIO/BoostNote.next/releases/latest',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    },
    {
      label: 'Log out',
      icon: mdiLogoutVariant,
      linkProps: {
        href: '/api/oauth/signout',
        onClick: (event: React.MouseEvent) => {
          event.preventDefault()
          if (usingElectron) {
            sendToHost('sign-out')
          } else {
            window.location.href = `${process.env.BOOST_HUB_BASE_URL}/api/oauth/signout`
          }
        },
      },
    },
  ]
}

function isCodeMirrorTextAreaEvent(event: KeyboardEvent) {
  const target = event.target as HTMLTextAreaElement
  if (target == null || target.tagName.toLowerCase() !== 'textarea') {
    return false
  }
  const classNameOfParentParentElement =
    target.parentElement?.parentElement?.className
  if (classNameOfParentParentElement == null) {
    return false
  }
  if (!/CodeMirror/.test(classNameOfParentParentElement)) {
    return false
  }

  return true
}
