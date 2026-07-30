import {
  lucideActivity,
  lucideArrowLeft,
  lucideCalendarDays,
  lucideChevronDown,
  lucideChevronLeft,
  lucideChevronRight,
  lucideChevronsUpDown,
  lucideCircleAlert,
  lucideCircleCheckBig,
  lucideCirclePause,
  lucideCirclePlay,
  lucideClock,
  lucideColumns3,
  lucideCopy,
  lucideEllipsis,
  lucideEye,
  lucideEyeOff,
  lucideFileSpreadsheet,
  lucideHistory,
  lucideHouse,
  lucideInfo,
  lucideLayers,
  lucideLoaderCircle,
  lucideLock,
  lucideLogOut,
  lucideMenu,
  lucideMessageSquare,
  lucideMoon,
  lucideMousePointerClick,
  lucidePencil,
  lucidePlay,
  lucidePlus,
  lucideRefreshCw,
  lucideSave,
  lucideSearch,
  lucideSend,
  lucideSkipForward,
  lucideSun,
  lucideTrash2,
  lucideTrendingUp,
  lucideTriangleAlert,
  lucideUserPlus,
  lucideUsers,
  lucideX,
  lucideZap,
} from '@ng-icons/lucide';

/**
 * The 45 icons the dashboard uses, registered once at bootstrap.
 *
 * **Why not `lucide-angular`?** That package (v1.0.0) ships pre-Angular-16 packaging:
 * its `.d.ts` files sit in `lib/` with the runtime in `esm2020/lib/`, and no `exports`
 * entry bridges the two. Angular's compiler emits a deep import against the declaration
 * path, which esbuild cannot resolve — the build fails outright. `@ng-icons/lucide`
 * wraps the same lucide artwork with modern `fesm2022` packaging.
 *
 * The trade is naming: `@ng-icons` tracks lucide's current names, so eight icons differ
 * from the `lucide-react` originals. Mapping, old → new:
 *
 *   Home           → lucideHouse           AlertCircle → lucideCircleAlert
 *   MoreHorizontal → lucideEllipsis        AlertTriangle → lucideTriangleAlert
 *   Loader2        → lucideLoaderCircle    CheckCircle2  → lucideCircleCheckBig
 *   PauseCircle    → lucideCirclePause     PlayCircle    → lucideCirclePlay
 *
 * The artwork is identical; only the identifier moved.
 */
export const APP_ICONS = {
  lucideActivity,
  lucideArrowLeft,
  lucideCalendarDays,
  lucideChevronDown,
  lucideChevronLeft,
  lucideChevronRight,
  lucideChevronsUpDown,
  lucideCircleAlert,
  lucideCircleCheckBig,
  lucideCirclePause,
  lucideCirclePlay,
  lucideClock,
  lucideColumns3,
  lucideCopy,
  lucideEllipsis,
  lucideEye,
  lucideEyeOff,
  lucideFileSpreadsheet,
  lucideHistory,
  lucideHouse,
  lucideInfo,
  lucideLayers,
  lucideLoaderCircle,
  lucideLock,
  lucideLogOut,
  lucideMenu,
  lucideMessageSquare,
  lucideMoon,
  lucideMousePointerClick,
  lucidePencil,
  lucidePlay,
  lucidePlus,
  lucideRefreshCw,
  lucideSave,
  lucideSearch,
  lucideSend,
  lucideSkipForward,
  lucideSun,
  lucideTrash2,
  lucideTrendingUp,
  lucideTriangleAlert,
  lucideUserPlus,
  lucideUsers,
  lucideX,
  lucideZap,
};
