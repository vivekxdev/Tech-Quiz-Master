import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { resultPageStyles, getColorClass, colorClasses, getBadgeClasses, getBadgeText } from '../assets/dummyStyles (1).js'
import { useApi } from '../services/api/api.js'
import { parseResultsPayload } from '../utils/quizResults.js'
import { summarizePerformance, TREND_MINIMUM_ATTEMPTS } from '../utils/performanceSummary.js'
import AttemptReview from './AttemptReview.jsx'
import StatePanel from './ui/StatePanel.jsx'
import Skeleton from './ui/Skeleton.jsx'
import Button from './ui/Button.jsx'

const Badge = ({ percent }) => {
    const classes = getBadgeClasses(percent)
    const text = getBadgeText(percent)

    return <span className={classes}>{text}</span>
}

// Safe date handling: prefers the stored completion date and falls back to the
// record's createdAt, so legacy rows without startDate (or with a corrupt one)
// never render "Invalid Date". Returns '—' when nothing parseable exists.
const toSafeDate = (value) => {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatDate = (value) => {
    const date = toSafeDate(value)
    if (!date) return { date: '—', time: '—', full: '—' }
    return {
        date: date.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }),
        time: date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        }),
        full: date.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }),
    }
}

const formatTimeTaken = (seconds) => {
    const total = Number(seconds)
    if (!Number.isFinite(total) || total <= 0) return "0s"
    if (total < 60) return `${total}s`
    if (total < 3600) {
        const mins = Math.floor(total / 60)
        const secs = total % 60
        return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`
    }
    const hours = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    const secs = total % 60
    return `${hours}h ${mins}m ${secs}s`
}

// Ensure unique key: fallback to title+startDate+index if id is missing or not unique
const makeResultKey = (result, index) => {
    if (result.id && result.title && result.startDate) {
        return `${result.id}||${result.title}||${result.startDate}`
    }
    return `${result.title || 'unknown'}||${result.startDate || index}||${index}`
}

function StripCard({ item, onReview }) {
    const percent = item.totalQuestions
        ? Math.round((item.correct / item.totalQuestions) * 100)
        : 0

    const colorKey = getColorClass(percent)
    const colors = colorClasses[colorKey]
    const completed = formatDate(item.startDate || item.createdAt)

    return (
        <article className={resultPageStyles.stripCard(colors)}>
            <div className={resultPageStyles.stripCardAccent(colors)}></div>
            <div className={resultPageStyles.stripCardContent}>
                <div className={resultPageStyles.stripCardTopRow}>
                    <div className={resultPageStyles.stripCardIdentity}>
                        <div className={resultPageStyles.stripCardIconContainer(colors)}>
                            <span className={resultPageStyles.stripCardIconText}>
                                {item.title.split(' ')[1]?.[0] || item.title[0]}
                            </span>
                        </div>
                        <div className={resultPageStyles.stripCardTitleContainer}>
                            <h3 className={resultPageStyles.stripCardTitle}> {item.title} </h3>
                            <div className={resultPageStyles.stripCardSubtitle}>
                                {item.totalQuestions} Questions
                            </div>
                        </div>
                    </div>
                    <div
                        className={resultPageStyles.stripCardPercentContainer}
                        aria-label={`${percent}% score`}
                    >
                        <div className={resultPageStyles.stripCardPercent(colors)}>
                            {percent}%
                        </div>
                        <div className={resultPageStyles.stripCardBadgeContainer}>
                            <Badge percent={percent} />
                        </div>
                    </div>
                </div>

                <div className={resultPageStyles.stripCardStatsRow}>
                    <div className={resultPageStyles.stripCardStat(true, colors)}>
                        <div className={resultPageStyles.stripCardStatNumber}>
                            {item.correct}
                        </div>
                        <div className={resultPageStyles.stripCardStatLabel}>Correct</div>
                    </div>
                    <div className={resultPageStyles.stripCardStat(false, colors)}>
                        <div className={resultPageStyles.stripCardStatNumber}>
                            {item.wrong}
                        </div>
                        <div className={resultPageStyles.stripCardStatLabel}>Wrong</div>
                    </div>
                    <div className={resultPageStyles.stripCardStat(false, colors)}>
                        <div className={resultPageStyles.stripCardStatNumber}>
                            {item.unattempted}
                        </div>
                        <div className={resultPageStyles.stripCardStatLabel}>
                            Unattempted
                        </div>
                    </div>
                </div>

                <div className={resultPageStyles.stripCardMeta}>
                    <div className={resultPageStyles.stripCardMetaItem}>
                        <div className={resultPageStyles.stripCardMetaLabel}>Date</div>
                        <div className={resultPageStyles.stripCardMetaValue}>
                            {completed.date}
                        </div>
                    </div>
                    <div className={resultPageStyles.stripCardMetaItem}>
                        <div className={resultPageStyles.stripCardMetaLabel}>
                            Time Taken
                        </div>
                        <div className={resultPageStyles.stripCardMetaValue}>
                            {formatTimeTaken(item.timeTaken)}
                        </div>
                    </div>
                    <div className={resultPageStyles.stripCardMetaItem}>
                        <div className={resultPageStyles.stripCardMetaLabel}>
                            Started At
                        </div>
                        <div className={resultPageStyles.stripCardMetaValue}>
                            {completed.time}
                        </div>
                    </div>
                </div>

                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={resultPageStyles.stripCardReview}
                    onClick={() => onReview(item)}
                    aria-label={`Review answers for ${item.title} on ${completed.full}`}
                >
                    Review answers
                </Button>
            </div>
        </article>
    )
}

function LoadingState() {
    return (
        <div className={resultPageStyles.loadingWrap} role="status" aria-live="polite">
            <div className={resultPageStyles.loadingCard}>
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <div className={resultPageStyles.loadingGrid}>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </div>
            </div>
        </div>
    )
}

// Tone/icon pass through so this panel matches the app's other state
// panels: errors present as danger, empty states stay neutral.
function StateCard({ title, message, tone, icon, children }) {
    return (
        <StatePanel tone={tone} icon={icon} title={title} message={message}>
            {children}
        </StatePanel>
    )
}

function ResultsList({ groupedResults, onReview }) {
    return (
        <>
            {Object.entries(groupedResults).map(([track, items]) => (
                <section className={resultPageStyles.trackSection} key={track}>
                    <div className={resultPageStyles.trackHeader}>
                        <h2 className={resultPageStyles.trackTitle}>
                            {track} Track
                        </h2>
                    </div>
                    <div className={resultPageStyles.cardsGrid}>
                        {items.map((item, index) => (
                            <StripCard
                                key={makeResultKey(item, index)}
                                item={item}
                                onReview={onReview}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </>
    )
}

// Four headline tiles computed from the real stored rows (see
// utils/performanceSummary.js for the exact rules). Values that the data
// cannot support show '—' plus a reason instead of a fabricated figure.
function PerformanceSummary({ summary }) {
    const trendLabel = !summary.trend
        ? '—'
        : summary.trend.direction === 'up'
            ? `↑ +${summary.trend.delta}%`
            : summary.trend.direction === 'down'
                ? `↓ ${summary.trend.delta}%`
                : `→ ${summary.trend.delta}%`

    const trendTone = !summary.trend
        ? resultPageStyles.summaryTileValueMuted
        : summary.trend.direction === 'up'
            ? resultPageStyles.summaryTileValueUp
            : summary.trend.direction === 'down'
                ? resultPageStyles.summaryTileValueDown
                : resultPageStyles.summaryTileValueMuted

    const tiles = [
        {
            label: 'Total attempts',
            value: String(summary.attempts),
            sub: 'scored attempts',
            tone: resultPageStyles.summaryTileValueDefault,
        },
        {
            label: 'Average score',
            value: summary.average === null ? '—' : `${summary.average}%`,
            sub: 'per attempt',
            tone: summary.average === null
                ? resultPageStyles.summaryTileValueMuted
                : resultPageStyles.summaryTileValueDefault,
        },
        {
            label: 'Best score',
            value: summary.best === null ? '—' : `${summary.best}%`,
            sub: 'highest attempt',
            tone: summary.best === null
                ? resultPageStyles.summaryTileValueMuted
                : resultPageStyles.summaryTileValueDefault,
        },
        {
            label: 'Recent trend',
            value: trendLabel,
            sub: summary.trend
                ? `last 3 vs previous 3 (${summary.trend.recentAverage}% vs ${summary.trend.previousAverage}%)`
                : `Needs ${TREND_MINIMUM_ATTEMPTS}+ attempts`,
            tone: trendTone,
        },
    ]

    return (
        <section
            aria-labelledby="performance-summary-heading"
            className={resultPageStyles.summarySection}
        >
            <h2
                id="performance-summary-heading"
                className={resultPageStyles.trackTitle}
            >
                Performance summary
            </h2>
            <div className={resultPageStyles.summaryGrid}>
                {tiles.map((tile) => (
                    <div key={tile.label} className={resultPageStyles.summaryTile}>
                        <div className={resultPageStyles.summaryTileLabel}>
                            {tile.label}
                        </div>
                        <div
                            className={`${resultPageStyles.summaryTileValue} ${tile.tone}`}
                        >
                            {tile.value}
                        </div>
                        <div className={resultPageStyles.summaryTileSub}>
                            {tile.sub}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

const MyResult = () => {
    const { request } = useApi()
    const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'success'
    const [errorMessage, setErrorMessage] = useState('')
    const [results, setResults] = useState([])
    const [fetchAttempt, setFetchAttempt] = useState(0)
    // The recorded attempt currently reopened in the review dialog (null = closed).
    const [reviewing, setReviewing] = useState(null)

    useEffect(() => {
        let isCurrent = true

        const loadResults = async () => {
            setStatus('loading')
            try {
                const data = await request('/results/my-results')
                if (!isCurrent) return

                const parsed = parseResultsPayload(data)
                if (parsed.error) {
                    console.error('Unexpected response from /results/my-results:', data)
                    setErrorMessage(parsed.error)
                    setStatus('error')
                    return
                }

                setResults(parsed.results)
                setStatus('success')
            } catch (err) {
                if (!isCurrent) return
                console.error('Failed to load quiz results:', err)
                setErrorMessage(err.message || 'Something went wrong while loading your results.')
                setStatus('error')
            }
        }

        loadResults()

        return () => {
            isCurrent = false
        }
        // `request` gets a new identity on every render; listing it here would
        // refetch in a loop, so the fetch is re-run only when the user retries.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchAttempt])

    const headingTitle = useMemo(() => {
        const tracks = Array.from(
            new Set(
                results.map((r) => (r.title || "").split(" ")[0]).filter(Boolean),
            ),
        )
        if (tracks.length === 1) return `Quiz Results — ${tracks[0]} Track`
        if (tracks.length === 2) return `Quiz Results — ${tracks.join(" & ")} Tracks`
        if (tracks.length > 2) return `Quiz Results — Multiple Tracks`
        return "Quiz Results"
    }, [results])

    const groupedResults = useMemo(() => {
        const groups = {}
        results.forEach((r) => {
            const track = (r.title || "").split(" ")[0] || "General"
            if (!groups[track]) groups[track] = []
            groups[track].push(r)
        })
        return groups
    }, [results])

    // Headline figures over the SAME rows the list renders (see
    // utils/performanceSummary.js for the calculation rules).
    const performance = useMemo(() => summarizePerformance(results), [results])

    const handleRetry = () => setFetchAttempt((attempt) => attempt + 1)

    return (
        <div className={resultPageStyles.container}>
            <div className={resultPageStyles.innerContainer}>
                <header className={resultPageStyles.header}>
                    <div className={resultPageStyles.headerBox}>
                        <h1 className={resultPageStyles.headerTitle}>
                            {headingTitle}
                        </h1>
                        <p className={resultPageStyles.headerSubtitle}>
                            Your saved attempts, scores and time taken across
                            every technology track.
                        </p>
                    </div>
                </header>

                {status === 'loading' && <LoadingState />}

                {status === 'error' && (
                    <StateCard
                        title="Couldn't load your results"
                        message={errorMessage}
                        tone="danger"
                        icon={<AlertCircle size={22} aria-hidden="true" />}
                    >
                        <Button type="button" onClick={handleRetry}>
                            Try again
                        </Button>
                    </StateCard>
                )}

                {status === 'success' && results.length === 0 && (
                    <StateCard
                        title="No results yet"
                        message="You haven't completed any quizzes yet."
                    >
                        <Link
                            to="/"
                            className={resultPageStyles.startLink}
                        >
                            Start practicing
                        </Link>
                    </StateCard>
                )}

                {status === 'success' && results.length > 0 && (
                    <>
                        <PerformanceSummary summary={performance} />
                        <ResultsList
                            groupedResults={groupedResults}
                            onReview={setReviewing}
                        />
                    </>
                )}
            </div>

            {reviewing && (
                <AttemptReview
                    result={reviewing}
                    onClose={() => setReviewing(null)}
                />
            )}
        </div>
    )
}

export default MyResult
