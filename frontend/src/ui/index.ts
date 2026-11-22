/**
 * Matcha UI kit — "Press Edition". Everything a screen needs; see src/ui/README.md.
 * Importing anything from '@/ui' also loads the fonts, tokens and global styles.
 */
import './styles/index.css'

export { cx } from './cx'
export type { Tone } from './tones'
export { TONES, TONE_COLOR } from './tones'

// icons
export * from './icons'

// lettering
export { Headline, PosterWord } from './lettering/Headline'
export type { HeadlineProps, HeadlineSize, HeadlinePrint, TypeWidth, PosterWordProps } from './lettering/Headline'
export { Label, Text, VisuallyHidden } from './lettering/Text'
export type { LabelProps, LabelTone, TextProps } from './lettering/Text'
export { Wordmark, LogoMark } from './lettering/Wordmark'
export type { WordmarkProps, LogoMarkProps } from './lettering/Wordmark'
export { Stamp, Sticker } from './lettering/Stamp'
export type { StampProps, StickerProps } from './lettering/Stamp'
export { Marquee } from './lettering/Marquee'
export type { MarqueeProps } from './lettering/Marquee'

// print furniture
export { Pattern, Halftone, Perforation, Serial, Barcode, CropMarks, RegMark, ColorBar, TicketHeader } from './print/Print'
export type {
  PatternKind,
  PatternProps,
  HalftoneProps,
  PerforationProps,
  SerialProps,
  BarcodeProps,
  CropMarksProps,
  RegMarkProps,
  TicketHeaderProps,
} from './print/Print'

// controls
export { Button, ButtonLink, IconButton, ActionButton } from './controls/Button'
export type {
  ButtonProps,
  ButtonLinkProps,
  ButtonVariant,
  ButtonSize,
  IconButtonProps,
  ActionButtonProps,
  ActionKind,
} from './controls/Button'
export { Field, FieldHint, FieldError, TextField, PasswordField, TextArea, Select } from './controls/Field'
export type {
  FieldProps,
  FieldMessages,
  TextFieldProps,
  PasswordFieldProps,
  TextAreaProps,
  SelectProps,
  SelectOption,
} from './controls/Field'
export { Segmented, Checkbox, Switch, Slider, DualSlider } from './controls/Choice'
export type {
  SegmentedProps,
  SegmentedOption,
  CheckboxProps,
  SwitchProps,
  SliderProps,
  DualSliderProps,
} from './controls/Choice'
export { TagInput } from './controls/TagInput'
export type { TagInputProps } from './controls/TagInput'
export { PhotoTile } from './controls/PhotoTile'
export type { PhotoTileProps } from './controls/PhotoTile'
export { Notice, FormError } from './controls/Notice'
export type { NoticeProps, NoticeTone, FormErrorProps, FormErrorInput } from './controls/Notice'

// display
export { Card } from './display/Card'
export type { CardProps } from './display/Card'
export { Chip, Badge, CountBadge } from './display/Chip'
export type { ChipProps, BadgeProps, CountBadgeProps } from './display/Chip'
export { Avatar, PhotoFrame, PosterFigure } from './display/Photo'
export type { AvatarProps, PhotoFrameProps, PosterFigureProps } from './display/Photo'
export { Spinner, Loader, Skeleton } from './display/Loader'
export type { SpinnerProps, LoaderProps, SkeletonProps } from './display/Loader'
export { Stat, StatGroup, Steps, Tabs, TabPanel, ListRow, EmptyState } from './display/Data'
export type { StatProps, StepsProps, TabsProps, TabItem, TabPanelProps, ListRowProps, EmptyStateProps } from './display/Data'
export { ProfileCard } from './display/ProfileCard'
export type { ProfileCardProps, CardStamp } from './display/ProfileCard'
export { MatchCelebration, MatchMoment } from './display/Match'
export type { MatchCelebrationProps, MatchMomentProps, MatchPerson } from './display/Match'

// overlays
export { toast } from './overlay/toast'
export type { ToastInput, ToastItem, ToastTone } from './overlay/toast'
export { Toaster } from './overlay/Toaster'
export type { ToasterProps } from './overlay/Toaster'
export { Modal, Sheet } from './overlay/Modal'
export { closeModals } from './overlay/openModals'
export type { ModalProps, SheetProps } from './overlay/Modal'
export { Menu, ActionList } from './overlay/Menu'
export type { MenuProps, MenuItem, ActionListProps } from './overlay/Menu'

// chat
export { ChatBubble, TypingIndicator, DayDivider, ChatComposer, ChatThread } from './chat/Chat'
export type { ChatBubbleProps, ChatComposerProps } from './chat/Chat'

// layout
export { AppShell, Pane, Screen, PageHeader, Stack, Row } from './layout/Shell'
export type { AppShellProps, ShellTab, PaneProps, ScreenProps, PageHeaderProps, StackProps, RowProps } from './layout/Shell'
export { AuthLayout, Poster } from './layout/Auth'
export type { AuthLayoutProps, PosterProps } from './layout/Auth'
