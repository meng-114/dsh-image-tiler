/*!
 * dsh-image-tiler browser half: the "image-tiler" settings card.
 *
 * Registers one card into `settings.plugin.item` keyed by the namespace the
 * Host serves (`image-tiler`), reading and writing it through
 * `ctx.settingsScope.bind({ namespace })`. The card renders nothing while the
 * namespace is unavailable, matching the settings-plugins contract. Its shell
 * mirrors the shipped PluginCard: a clickable header (name + description +
 * chevron) disclosing the controls in place.
 */
window.__ModuleLoader__.load({
  id: '@mengli114/dsh-image-tiler',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    /** Settings namespace this card edits (must match the Host registration). */
    var NS = 'image-tiler'

    /** Field definitions, in display order. */
    var FIELDS = [
      { key: 'autoTile', type: 'boolean', label: '自动切片', hint: '用户提供大图时，工具描述会引导模型先切片再逐张读取' },
      { key: 'tileSize', type: 'number', label: '切片边长 (px)', min: 64, max: 4096 },
      { key: 'overlap', type: 'number', label: '重叠 (px)', min: 0, max: 2048 },
      { key: 'format', type: 'select', label: '输出格式', options: ['png', 'jpeg', 'webp'] },
      { key: 'maxTiles', type: 'number', label: '最大切片数', min: 1, max: 600 },
      { key: 'overviewSize', type: 'number', label: '缩略图边长 (px)', min: 128, max: 4096 },
      { key: 'label', type: 'boolean', label: '切片坐标标注', hint: '在每个切片顶部绘制 r/c 坐标与源图位置' },
      { key: 'outputDir', type: 'text', label: '输出目录', hint: '会话工作区相对路径，如 tiles' },
    ]

    /**
     * Card shell styles, mirroring the shipped PluginCard (module CSS) so the
     * card reads as a sibling of the agent-loop / web-search cards.
     */
    var CSS_TEXT = [
      '.imgtCard_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}',
      '.imgtCard_card:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.imgtCard_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.imgtCard_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
      '.imgtCard_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.imgtCard_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
      '.imgtCard_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
      '.imgtCard_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
      '.imgtCard_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
      '.imgtCard_chevronOpen{transform:rotate(180deg)}',
      '.imgtCard_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
      '.imgtCard_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}',
      '.imgtCard_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}',
      '.imgtCard_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}',
      '.imgtCard_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}',
      '.imgtCard_discard,.imgtCard_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}',
      '.imgtCard_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}',
      '.imgtCard_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
      '.imgtCard_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
      '.imgtCard_discard:disabled,.imgtCard_save:disabled{opacity:.4;cursor:default}',
      '.imgtCard_discard:focus-visible,.imgtCard_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
    ].join('')

    var CSS_TAG = '@mengli114/dsh-image-tiler/ImageTilerCard.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = '@mengli114/dsh-image-tiler'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = CSS_TEXT
      document.head.appendChild(tag)
    }

    /** Inline styles for the field rows (controls need no module CSS). */
    var ROW = { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }
    var LABEL = { flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: '2px' }
    var LABEL_TEXT = { color: 'var(--dsw-alias-label-primary)', fontWeight: '600', fontSize: '13px' }
    var HINT = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px', lineHeight: '1.4' }
    var OVERRIDDEN = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' }
    var CONTROL = { flex: '1 1 auto', minWidth: '0' }
    var INPUT = { width: '100%', maxWidth: '320px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', fontSize: '13px' }
    var CHECKBOX = { accentColor: 'var(--dsw-alias-state-business-primary, #4d8dff)' }
    var SELECT = { padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', fontSize: '13px' }

    /** Subscribe a component to the scope snapshot. */
    function useScope(scope) {
      var pair = React.useState(function () { return scope.getSnapshot() })
      React.useEffect(function () {
        return scope.subscribe(function () { pair[1](scope.getSnapshot()) })
      }, [])
      return pair[0]
    }

    /** Parse a draft string per field type; returns the value or undefined when invalid. */
    function parseDraft(field, text) {
      if (field.type === 'number') {
        var n = Number(String(text).trim())
        if (text === undefined || String(text).trim() === '' || !Number.isFinite(n)) return undefined
        if (field.min !== undefined && n < field.min) return undefined
        if (field.max !== undefined && n > field.max) return undefined
        return n
      }
      return text
    }

    /** One control row for a field. */
    function FieldRow(props) {
      var field = props.field
      var value = props.value
      var draft = props.draft
      var hasDraft = draft !== undefined && draft !== null
      var overridden = props.overridden
      var onDraft = props.onDraft
      var disabled = props.disabled

      var control
      if (field.type === 'boolean') {
        control = React.createElement('input', {
          type: 'checkbox',
          checked: hasDraft ? draft === true : value === true,
          disabled: disabled,
          onChange: function (e) { onDraft(e.target.checked) },
          style: CHECKBOX,
        })
      } else if (field.type === 'select') {
        control = React.createElement('select', {
          value: hasDraft ? draft : String(value),
          disabled: disabled,
          onChange: function (e) { onDraft(e.target.value) },
          style: SELECT,
        }, field.options.map(function (opt) {
          return React.createElement('option', { key: opt, value: opt }, opt)
        }))
      } else {
        control = React.createElement('input', {
          type: field.type === 'number' ? 'number' : 'text',
          value: hasDraft ? draft : String(value ?? ''),
          min: field.min,
          max: field.max,
          disabled: disabled,
          placeholder: String(value ?? ''),
          onChange: function (e) { onDraft(e.target.value) },
          style: INPUT,
        })
      }

      return React.createElement('div', { style: ROW },
        React.createElement('div', { style: LABEL },
          React.createElement('span', { style: LABEL_TEXT }, field.label),
          field.hint ? React.createElement('span', { style: HINT }, field.hint) : null,
          overridden ? React.createElement('span', { style: OVERRIDDEN }, '已覆盖（用户设置）') : null,
        ),
        React.createElement('div', { style: CONTROL }, control),
      )
    }

    /** The plugin's settings card, shelled like the shipped PluginCard. */
    function SettingsCard(props) {
      var scope = props.scope
      var snap = useScope(scope)
      var value = snap.value
      var user = snap.user
      var writable = snap.writable
      var drafts = React.useState({})
      var saving = React.useState(false)
      var status = React.useState('')
      var open = React.useState(false)
      var setDrafts = drafts[1]
      var setSaving = saving[1]
      var setStatus = status[1]

      if (snap.status !== 'ready' || value === undefined) return null

      var hasUser = function (key) { return user !== undefined && Object.hasOwn(user, key) }
      var hasDraft = function (key) { return drafts[0][key] !== undefined }
      var dirty = Object.keys(drafts[0]).length > 0
      var overriddenCount = FIELDS.filter(function (f) { return hasUser(f.key) }).length

      var onDraft = function (key, raw) {
        setDrafts(function (prev) {
          var next = Object.assign({}, prev)
          next[key] = raw
          return next
        })
        setStatus('')
      }

      var save = function () {
        var pending = []
        FIELDS.forEach(function (field) {
          if (!hasDraft(field.key)) return
          var parsed = parseDraft(field, drafts[0][field.key])
          if (parsed === undefined) {
            pending.push(Promise.reject(new Error(field.key + ' 值无效')))
            return
          }
          pending.push(scope.set(field.key, parsed))
        })
        if (pending.length === 0) return
        setSaving(true)
        setStatus('')
        Promise.all(pending).then(function () {
          setSaving(false)
          setStatus('')
          setDrafts({})
        }).catch(function () {
          setSaving(false)
          setStatus('保存失败，请检查输入')
        })
      }

      var clearOverrides = function () {
        var keys = FIELDS.filter(function (field) { return hasUser(field.key) }).map(function (field) { return field.key })
        if (keys.length === 0) return
        setSaving(true)
        setStatus('')
        Promise.all(keys.map(function (key) { return scope.unset(key) })).then(function () {
          setSaving(false)
          setStatus('')
          setDrafts({})
        }).catch(function () {
          setSaving(false)
          setStatus('重置失败')
        })
      }

      var header = React.createElement('button', {
        type: 'button',
        className: 'imgtCard_header',
        'aria-expanded': open[0],
        'aria-label': (open[0] ? '收起' : '展开') + ': Image Tiler 切片工具',
        onClick: function () { open[1](!open[0]) },
      },
        React.createElement('span', { className: 'imgtCard_headText' },
          React.createElement('span', { className: 'imgtCard_name' }, 'Image Tiler 切片工具'),
          React.createElement('span', { className: 'imgtCard_description' }, '大图切片的默认参数与自动切片开关。'),
        ),
        dirty ? React.createElement('span', { className: 'imgtCard_pending' }, '未保存') : null,
        React.createElement('svg', {
          className: 'imgtCard_chevron' + (open[0] ? ' imgtCard_chevronOpen' : ''),
          viewBox: '0 0 14 14', width: 14, height: 14, fill: 'none', 'aria-hidden': true,
        },
          React.createElement('path', { d: 'M3 5.5l4 3 4-3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        ),
      )

      return React.createElement('li', { className: 'imgtCard_card' + (open[0] ? ' imgtCard_cardOpen' : '') },
        header,
        open[0] ? React.createElement('div', { className: 'imgtCard_body' },
          !writable ? React.createElement('p', { className: 'imgtCard_readOnly', role: 'status' }, '设置文档当前只读。') : null,
          FIELDS.map(function (field) {
            return React.createElement(FieldRow, {
              key: field.key,
              field: field,
              value: value[field.key],
              draft: hasDraft(field.key) ? drafts[0][field.key] : undefined,
              overridden: hasUser(field.key),
              disabled: !writable,
              onDraft: function (raw) { onDraft(field.key, raw) },
            })
          }),
          React.createElement('div', { className: 'imgtCard_footer' },
            status[0] ? React.createElement('p', { className: 'imgtCard_failed', role: 'status' }, status[0]) : null,
            React.createElement('button', {
              type: 'button',
              className: 'imgtCard_discard',
              disabled: saving[0] || overriddenCount === 0,
              onClick: clearOverrides,
            }, '清除覆盖'),
            React.createElement('button', {
              type: 'button',
              className: 'imgtCard_save',
              disabled: saving[0] || !dirty,
              onClick: save,
            }, saving[0] ? '保存中…' : '保存'),
          ),
        ) : null,
      )
    }

    var inject = ['slots', 'settingsScope']

    /** -----------------------------------------------------------------
     * Visual slice workbench: the tile_image tool call card.
     * Live from the host workbench endpoints (/dsh-imgtiler/*):
     * preview -> slice -> select, with a source-image grid overlay and a
     * tile thumbnail picker that drives what read_tiles returns.
     * ----------------------------------------------------------------- */
    var API = '/dsh-imgtiler'
    var WB_STYLES = {
      wrap: { padding: '12px 0 4px', display: 'flex', flexDirection: 'column', gap: '10px' },
      row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      label: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #999)' },
      range: { flex: '1 1 120px', maxWidth: '220px' },
      num: { fontSize: '12px', minWidth: '180px' },
      canvas: { position: 'relative', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))', borderRadius: '8px', overflow: 'hidden' },
      img: { display: 'block', width: '100%', maxHeight: '360px', objectFit: 'contain' },
      overlay: { position: 'absolute', inset: '0', pointerEvents: 'none' },
      button: { padding: '5px 14px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))', background: 'transparent', color: 'inherit', fontSize: '13px', cursor: 'pointer' },
      primary: { borderColor: 'var(--dsw-alias-state-business-primary, #4d8dff)', color: 'var(--dsw-alias-state-business-primary, #4d8dff)' },
      status: { fontSize: '12px', opacity: '.75' },
      grid: { display: 'grid', gap: '6px', maxHeight: '280px', overflow: 'auto' },
      tile: { position: 'relative', cursor: 'pointer', border: '2px solid transparent', borderRadius: '6px', overflow: 'hidden' },
      tileOn: { borderColor: 'var(--dsw-alias-state-business-primary, #4d8dff)' },
      tileImg: { display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' },
      tileTag: { position: 'absolute', left: '4px', top: '4px', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '99px' },
      check: { position: 'absolute', right: '4px', top: '4px', accentColor: 'var(--dsw-alias-state-business-primary, #4d8dff)' },
    }

    /** Tiny fetch helper: JSON in/out, scoped to a session (tasks are per-session). */
    function api(method, path, body, session) {
      var url = API + path + (session ? (path.indexOf('?') >= 0 ? '&' : '?') + 'session=' + encodeURIComponent(session) : '')
      return fetch(url, method === 'GET'
        ? { method }
        : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
        .then(async (res) => {
          const text = await res.text()
          const data = text ? JSON.parse(text) : {}
          if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
          return data
        })
    }

    /** Image endpoint URL scoped to the workbench session. */
    function imgUrl(path, session) {
      return API + '/img?p=' + encodeURIComponent(path) + (session ? '&session=' + encodeURIComponent(session) : '')
    }

    /** One tile thumbnail with checkbox and a zoom affordance. */
    function TileThumb(props) {
      var tile = props.tile
      var on = props.checked
      var toggle = props.onToggle
      return React.createElement('div', {
        style: Object.assign({}, WB_STYLES.tile, on ? WB_STYLES.tileOn : null),
        onClick: toggle,
        title: tile.id + ' (' + tile.width + '×' + tile.height + ')',
      },
        React.createElement('img', { src: imgUrl(tile.path, props.session), style: WB_STYLES.tileImg, alt: tile.id, loading: 'lazy' }),
        React.createElement('span', { style: WB_STYLES.tileTag }, tile.id),
        React.createElement('input', { type: 'checkbox', style: WB_STYLES.check, checked: on, readOnly: true, 'aria-label': 'select ' + tile.id }),
        React.createElement('button', {
          type: 'button',
          'aria-label': '放大 ' + tile.id,
          onClick: function (e) {
            e.stopPropagation()
            if (props.onZoom) props.onZoom(tile)
          },
          style: {
            position: 'absolute', left: '4px', bottom: '4px',
            width: '22px', height: '22px', display: 'grid', placeItems: 'center',
            border: '0', borderRadius: '6px', cursor: 'zoom-in',
            background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '13px', lineHeight: 1,
          },
        }, '🔍'),
      )
    }

    /**
     * The tile_image tool card: adjust the grid live, slice, then pick which
     * tiles the model should read (selection flows into read_tiles).
     */
    function TileWorkbench(props) {
      var sessionId = props.sessionId || null
      var state = React.useState(null)
      var params = React.useState({ tileSize: 800, overlap: 40, format: 'png' })
      var preview = React.useState(null)
      var selected = React.useState({})
      var busy = React.useState('')
      var error = React.useState('')
      var numDraft = React.useState({})
      var zoom = React.useState(null)
      var page = React.useState(0)

      var snap = state[0]
      var p = params[0]
      var sel = selected[0]
      var draft = numDraft[0]

      var loadState = function () {
        api('GET', '/state', undefined, sessionId).then(state[1]).catch(function () { /* no task yet; card shows hint */ })
      }
      React.useEffect(function () { loadState() }, [])

      var refreshPreview = function (tileSize, overlap) {
        if (snap === null) return
        busy[1]('preview')
        api('POST', '/preview', { tileSize, overlap }, sessionId)
          .then(function (data) { preview[1](data); busy[1]('') })
          .catch(function (err) { error[1](String(err.message || err)); busy[1]('') })
      }

      var setTileSize = function (value) {
        var next = Object.assign({}, p, { tileSize: Number(value) })
        params[1](next)
        refreshPreview(next.tileSize, next.overlap)
      }
      var setOverlap = function (value) {
        var next = Object.assign({}, p, { overlap: Number(value) })
        params[1](next)
        refreshPreview(next.tileSize, next.overlap)
      }
      var setFormat = function (value) {
        params[1](Object.assign({}, p, { format: value }))
      }

      var doSlice = function () {
        busy[1]('slice')
        error[1]('')
        api('POST', '/slice', p, sessionId)
          .then(function (data) {
            state[1](data)
            preview[1](null)
            selected[1]({})
            page[1](0)
            busy[1]('')
            if (props.afterLoad) props.afterLoad()
          })
          .catch(function (err) { error[1](String(err.message || err)); busy[1]('') })
      }

      var toggleTile = function (id) {
        selected[1](Object.assign({}, sel, { [id]: !sel[id] }))
      }
      var selectAll = function () {
        if (snap === null) return
        var next = {}
        for (var i = 0; i < snap.tiles.length; i++) next[snap.tiles[i].id] = true
        selected[1](next)
      }
      var clearAll = function () { selected[1]({}) }
      var selectedIds = Object.keys(sel).filter(function (id) { return sel[id] })

      var confirmSelection = function () {
        if (selectedIds.length === 0) { error[1]('请至少选择一片切片'); return }
        busy[1]('select')
        error[1]('')
        api('POST', '/select', { tiles: selectedIds }, sessionId)
          .then(function () {
            busy[1]('')
            error[1]('')
            state[1](Object.assign({}, snap, { selected: selectedIds }))
          })
          .catch(function (err) { error[1](String(err.message || err)); busy[1]('') })
      }

      // Grid overlay geometry (only during preview params editing, before slice).
      var gridRect = null
      var previewTiles = preview[0] ? preview[0].tiles : null
      if (snap !== null && previewTiles !== null) {
        gridRect = { w: snap.source.width, h: snap.source.height }
      }

      // Drag a grid separator line to resize the tiles (pointer capture on
      // the document; first column/row lines carry the handle).
      var beginDrag = function (ev, axis) {
        if (snap === null) return
        ev.preventDefault()
        var svg = ev.currentTarget.ownerSVGElement
        var rect = svg.getBoundingClientRect()
        var move = function (me) {
          var v = axis === 'col'
            ? ((me.clientX - rect.left) / rect.width) * snap.source.width
            : ((me.clientY - rect.top) / rect.height) * snap.source.height
          v = Math.round(Math.max(64, Math.min(2048, v)) / 8) * 8
          setTileSize(v)
        }
        var up = function () {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', up)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', up)
      }

      // Numeric keyboard inputs: free typing first, clamp on blur/Enter, so
      // typing "800" over "64" does not fight the inline clamping.
      var commitNum = function (key, raw, min, max, setter) {
        var v = Number(raw)
        if (Number.isFinite(v)) setter(Math.max(min, Math.min(max, Math.round(v))))
        numDraft[1](Object.assign({}, numDraft[0], { [key]: undefined }))
      }
      var numInput = function (key, value, min, max, setter, label) {
        return React.createElement('input', {
          type: 'number', min: min, max: max, step: 8,
          value: draft[key] !== undefined ? draft[key] : value,
          onChange: function (e) { numDraft[1](Object.assign({}, numDraft[0], { [key]: e.target.value })) },
          onBlur: function () { commitNum(key, draft[key], min, max, setter) },
          onKeyDown: function (e) { if (e.key === 'Enter') commitNum(key, draft[key], min, max, setter) },
          style: Object.assign({}, WB_STYLES.input, { maxWidth: '84px' }),
          'aria-label': label,
        })
      }

      var header = React.createElement('div', { style: WB_STYLES.row },
        React.createElement('span', { style: WB_STYLES.label }, '切片边长'),
        React.createElement('input', { type: 'range', min: 64, max: 2048, step: 64, value: p.tileSize, onChange: function (e) { setTileSize(e.target.value) }, style: WB_STYLES.range }),
        numInput('tileSize', p.tileSize, 64, 2048, setTileSize, '切片边长（像素，可键盘输入）'),
        React.createElement('span', { style: WB_STYLES.num }, 'px'),
        React.createElement('span', { style: WB_STYLES.label }, '重叠'),
        React.createElement('input', { type: 'range', min: 0, max: 512, step: 16, value: p.overlap, onChange: function (e) { setOverlap(e.target.value) }, style: WB_STYLES.range }),
        numInput('overlap', p.overlap, 0, 512, setOverlap, '重叠像素（可键盘输入）'),
        React.createElement('span', { style: WB_STYLES.num }, 'px'),
        React.createElement('select', { value: p.format, onChange: function (e) { setFormat(e.target.value) }, 'aria-label': '输出格式' },
          React.createElement('option', { value: 'png' }, 'png'),
          React.createElement('option', { value: 'jpeg' }, 'jpeg'),
          React.createElement('option', { value: 'webp' }, 'webp'),
        ),
        React.createElement('button', { style: Object.assign({}, WB_STYLES.button, WB_STYLES.primary), disabled: busy[0] !== '' || snap === null, onClick: doSlice },
          busy[0] === 'slice' ? '切片中…' : (snap === null ? '请先调用 tile_image' : '切片')),
        previewTiles ? React.createElement('span', { style: WB_STYLES.num }, preview[0].cols + ' 列 × ' + preview[0].rows + ' 行 = ' + preview[0].count + ' 片') : null,
      )

      // Canvas: source preview + live grid overlay with draggable separators.
      var canvas = null
      if (snap !== null && gridRect !== null) {
        var svgw = gridRect.w
        var svgh = gridRect.h
        var dense = previewTiles.length > 60
        // First column/row separator positions (draggable handles).
        var colLine = null
        var rowLine = null
        for (var i = 0; i < previewTiles.length; i++) {
          if (colLine === null && previewTiles[i].col > 1) colLine = previewTiles[i].x
          if (rowLine === null && previewTiles[i].row > 1) rowLine = previewTiles[i].y
        }
        var handleR = Math.max(6, svgw / 160)
        var lineW = Math.max(1.5, svgw / 700)
        var sepChildren = []
        // All column separators (visual), with a handle on the first one.
        var colXs = {}
        for (var c = 0; c < previewTiles.length; c++) {
          var ct = previewTiles[c]
          if (ct.col > 1 && colXs[ct.col] === undefined) colXs[ct.col] = ct.x
        }
        Object.keys(colXs).forEach(function (k) {
          var x = colXs[k]
          sepChildren.push(React.createElement('line', { key: 'cl' + k, x1: x, y1: 0, x2: x, y2: svgh, stroke: 'rgba(77,141,255,0.9)', strokeWidth: lineW, strokeDasharray: '6 5' }))
        })
        var rowYs = {}
        for (var r = 0; r < previewTiles.length; r++) {
          var rt = previewTiles[r]
          if (rt.row > 1 && rowYs[rt.row] === undefined) rowYs[rt.row] = rt.y
        }
        Object.keys(rowYs).forEach(function (k) {
          var y = rowYs[k]
          sepChildren.push(React.createElement('line', { key: 'rl' + k, x1: 0, y1: y, x2: svgw, y2: y, stroke: 'rgba(77,141,255,0.9)', strokeWidth: lineW, strokeDasharray: '6 5' }))
        })
        if (colLine !== null) {
          sepChildren.push(React.createElement('circle', {
            key: 'hcol',
            cx: colLine, cy: svgh / 2, r: handleR,
            fill: 'rgba(77,141,255,0.25)', stroke: 'rgba(77,141,255,0.95)', strokeWidth: lineW,
            style: { cursor: 'ew-resize' },
            onPointerDown: function (ev) { beginDrag(ev, 'col') },
            'aria-hidden': true,
          }))
        }
        if (rowLine !== null) {
          sepChildren.push(React.createElement('circle', {
            key: 'hrow',
            cx: svgw / 2, cy: rowLine, r: handleR,
            fill: 'rgba(77,141,255,0.25)', stroke: 'rgba(77,141,255,0.95)', strokeWidth: lineW,
            style: { cursor: 'ns-resize' },
            onPointerDown: function (ev) { beginDrag(ev, 'row') },
            'aria-hidden': true,
          }))
        }
        canvas = React.createElement('div', { style: WB_STYLES.canvas },
          React.createElement('img', { src: imgUrl(snap.source.path, sessionId), style: WB_STYLES.img, alt: 'source' }),
          React.createElement('svg', { viewBox: '0 0 ' + svgw + ' ' + svgh, style: WB_STYLES.overlay, 'aria-hidden': true },
            previewTiles.map(function (tile) {
              return React.createElement('rect', {
                key: tile.id,
                x: tile.x, y: tile.y, width: tile.width, height: tile.height,
                fill: dense ? 'rgba(77,141,255,0.05)' : 'rgba(77,141,255,0.12)',
                stroke: dense ? 'rgba(77,141,255,0.35)' : 'rgba(77,141,255,0.85)',
                strokeWidth: dense ? Math.max(0.8, svgw / 900) : Math.max(1, svgw / 600),
              })
            }),
            sepChildren,
          ),
        )
      } else if (snap !== null && previewTiles === null) {
        // Sliced state: show the overview as the canvas.
        canvas = React.createElement('div', { style: WB_STYLES.canvas },
          React.createElement('img', { src: imgUrl(snap.overview, sessionId), style: WB_STYLES.img, alt: 'overview' }),
        )
      } else {
        canvas = React.createElement('div', { style: WB_STYLES.status }, '尚未切片——让模型调用 tile_image 后，这里会出现可视化切片工作台。')
      }

      // Tile picker grid (after slicing), paginated so huge grids stay usable.
      var picker = null
      if (snap !== null && snap.tiles.length > 0) {
        var PAGE = 40
        var pages = Math.max(1, Math.ceil(snap.tiles.length / PAGE))
        var curPage = Math.min(page[0], pages - 1)
        var shownTiles = snap.tiles.slice(curPage * PAGE, (curPage + 1) * PAGE)
        picker = React.createElement('div', null,
          React.createElement('div', { style: WB_STYLES.row },
            React.createElement('span', { style: WB_STYLES.label }, '勾选要给模型看的切片'),
            React.createElement('button', { style: WB_STYLES.button, onClick: selectAll, disabled: busy[0] !== '' }, '全选'),
            React.createElement('button', { style: WB_STYLES.button, onClick: clearAll, disabled: busy[0] !== '' }, '清空'),
            React.createElement('span', { style: WB_STYLES.status }, selectedIds.length + ' / ' + snap.tiles.length + ' 片'),
            pages > 1 ? React.createElement('span', { style: WB_STYLES.status },
              React.createElement('button', { style: WB_STYLES.button, disabled: busy[0] !== '' || curPage === 0, onClick: function () { page[1](curPage - 1) } }, '上一页'),
              ' ' + (curPage + 1) + '/' + pages + ' ',
              React.createElement('button', { style: WB_STYLES.button, disabled: busy[0] !== '' || curPage >= pages - 1, onClick: function () { page[1](curPage + 1) } }, '下一页'),
            ) : null,
            React.createElement('button', {
              style: Object.assign({}, WB_STYLES.button, WB_STYLES.primary),
              disabled: busy[0] !== '' || selectedIds.length === 0,
              onClick: confirmSelection,
            }, busy[0] === 'select' ? '确认中…' : '确认给模型看'),
            snap.selected && snap.selected.length > 0 ? React.createElement('span', { style: WB_STYLES.status }, '✓ 已确认 ' + snap.selected.length + ' 片（模型 read_tiles 将读取）') : null,
          ),
          React.createElement('div', { style: Object.assign({}, WB_STYLES.grid, { gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }) },
            shownTiles.map(function (tile) {
              return React.createElement(TileThumb, {
                key: tile.id,
                tile: tile,
                session: sessionId,
                checked: !!sel[tile.id] || (snap.selected || []).indexOf(tile.id) >= 0,
                onToggle: function () { toggleTile(tile.id) },
                onZoom: zoom[1],
              })
            }),
          ),
        )
      }

      var zoomOverlay = zoom[0] ? React.createElement('div', {
        style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.78)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'zoom-out' },
        onClick: function () { zoom[1](null) },
      },
        React.createElement('img', { src: imgUrl(zoom[0].path, sessionId), style: { maxWidth: '92vw', maxHeight: '84vh', objectFit: 'contain', borderRadius: '8px' }, alt: zoom[0].id }),
        React.createElement('span', { style: { color: '#fff', fontSize: 12, opacity: 0.8 } }, zoom[0].id + ' · 点击任意处关闭'),
      ) : null

      return React.createElement('div', { style: WB_STYLES.wrap },
        header,
        canvas,
        picker,
        error[0] ? React.createElement('div', { style: Object.assign({}, WB_STYLES.status, { color: 'var(--dsw-alias-label-error, #e5484d)' }) }, error[0]) : null,
        zoomOverlay,
      )
    }

    /**
     * Composer dock entry: appears once an image task exists (dropped image or
     * tile_image) and toggles the full workbench inline.
     */
    function DockWorkbench(props) {
      var owner = props.owner
      var cwdRef = props.cwdRef
      var sessRef = props.sessRef
      var notify = props.notify
      var open = React.useState(false)
      var snap = React.useState(null)
      var dragPos = React.useState(null)
      var sessionId = props.sessionId || null

      // Drag the modal panel by its title bar (fallback keeps it centered).
      var startDrag = function (ev) {
        ev.preventDefault()
        var panel = ev.currentTarget.parentElement
        var rect = panel.getBoundingClientRect()
        var startX = ev.clientX
        var startY = ev.clientY
        var base = dragPos[0] || { left: rect.left, top: rect.top }
        var move = function (me) {
          dragPos[1]({ left: Math.max(0, base.left + (me.clientX - startX)), top: Math.max(0, base.top + (me.clientY - startY)) })
        }
        var up = function () {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', up)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', up)
      }

      // Resolve the session workspace for drop imports (best effort).
      var cwd = null
      if (owner && typeof owner.useSessions === 'function') {
        var list = owner.useSessions(function (s) { return s })
        var sid = owner.sessionId || list.current
        if (sid && list.byId[sid]) cwd = list.byId[sid].cwd || null
      }
      React.useEffect(function () {
        if (cwd) cwdRef.set(cwd)
        if (sessionId) sessRef.set(sessionId)
      }, [cwd, sessionId])

      var load = function () {
        api('GET', '/state', undefined, sessionId)
          .then(function (data) { snap[1](data) })
          .catch(function () { snap[1](null) })
      }
      React.useEffect(function () {
        load()
        notify(load)
        return function () { notify(null) }
      }, [])

      if (snap[0] === null) return null
      var s = snap[0]
      var otherWs = !!(s.workspace && cwd && s.workspace !== cwd)
      var workbenchModal = null
      if (!otherWs && open[0]) {
        workbenchModal = React.createElement('div', {
          style: { position: 'fixed', inset: '0', zIndex: 100000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 4vw' },
          onClick: function () { open[1](false) },
        },
          React.createElement('div', {
            style: {
              position: 'absolute',
              left: dragPos[0] ? dragPos[0].left + 'px' : '50%',
              top: dragPos[0] ? dragPos[0].top + 'px' : '50%',
              transform: dragPos[0] ? 'none' : 'translate(-50%, -50%)',
              background: 'var(--dsw-alias-bg-layer-2, #1c1f26)',
              border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))',
              borderRadius: '14px',
              width: 'min(1200px, 94vw)',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '12px 20px',
              boxSizing: 'border-box',
              boxShadow: '0 24px 60px rgba(0,0,0,.45)',
            },
            onClick: function (e) { e.stopPropagation() },
          },
            React.createElement('div', {
              onPointerDown: startDrag,
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'move', userSelect: 'none',
                paddingBottom: '8px', marginBottom: '10px',
                borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))',
              },
            },
              React.createElement('span', { style: { fontWeight: '600', fontSize: '14px' } }, '🖼 图片切片工作台'),
              React.createElement('button', {
                type: 'button',
                'aria-label': '关闭切片工作台',
                onClick: function () { open[1](false) },
                style: {
                  width: '28px', height: '28px', display: 'grid', placeItems: 'center',
                  border: '0', borderRadius: '8px', cursor: 'pointer', flex: 'none',
                  background: 'transparent', color: 'var(--dsw-alias-label-secondary, #ccc)', fontSize: '18px', lineHeight: 1,
                },
              }, '×'),
            ),
            React.createElement(TileWorkbench, { afterLoad: load, sessionId: sessionId }),
          ),
        )
      }
      return React.createElement('div', { style: { width: '100%' } },
        React.createElement('div', { style: Object.assign({}, WB_STYLES.row, { justifyContent: 'space-between' }) },
          React.createElement('span', { style: Object.assign({}, WB_STYLES.status, otherWs ? { opacity: '.55' } : null) },
            otherWs ? '🖼 图片切片工作台（来自其他工作区，仅存档） · ' + s.source.width + '×' + s.source.height + ' · ' + s.count + ' 片'
              : '🖼 图片切片工作台 · ' + s.source.width + '×' + s.source.height + ' · ' + s.count + ' 片' + (s.selected.length > 0 ? ' · 已勾选 ' + s.selected.length : '')),
          React.createElement('button', {
            style: Object.assign({}, WB_STYLES.button, WB_STYLES.primary, otherWs ? { opacity: '.5' } : null),
            disabled: otherWs,
            onClick: function () { open[1](!open[0]) },
          }, open[0] ? '收起' : '打开工作台'),
        ),
        workbenchModal,
      )
    }

    function apply(ctx) {
      var scope = ctx.settingsScope.bind({ namespace: NS })
      ctx.slots.inject('settings.plugin.item', function () {
        return ctx.slots.register(
          { name: 'settings.plugin.item', key: NS },
          function () { return React.createElement(SettingsCard, { scope: scope }) },
        )
      })
      ctx.slots.inject('tool.call.toolview', function () {
        return ctx.slots.register(
          { name: 'tool.call.toolview', key: 'tile_image' },
          function (props) { return React.createElement(TileWorkbench, props) },
        )
      })

      // Drop-to-workbench: capture image drops at document capture phase,
      // import the first image, slice it, and surface the dock chip. The
      // native attachment flow is untouched — DSH still receives the file.
      var latestCwd = null
      var latestSession = null
      var notifyDock = null
      ctx.effect(function () {
        var onDrop = function (event) {
          var files = event.dataTransfer && event.dataTransfer.files
          if (!files || files.length === 0) return
          var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type || '') })
          if (imgs.length === 0 || latestCwd === null || latestSession === null) return
          var file = imgs[0]
          if (file.size > 20 * 1024 * 1024) return
          var reader = new FileReader()
          reader.onload = function () {
            var data = String(reader.result || '').split(',')[1] || ''
            if (!data) return
            api('POST', '/import', { filename: file.name || 'dropped.png', data, cwd: latestCwd }, latestSession)
              .then(function () { if (notifyDock) notifyDock() })
              .catch(function () { /* best effort; native flow already handles the file */ })
          }
          reader.readAsDataURL(file)
        }
        document.addEventListener('drop', onDrop, true)
        return function () { document.removeEventListener('drop', onDrop, true) }
      }, 'image-tiler: drop capture')

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          { name: 'conversation.input.dock', id: 'image-tiler-workbench', order: 5 },
          function (props) {
            return React.createElement(DockWorkbench, {
              owner: props,
              sessionId: props.sessionId,
              cwdRef: { set: function (v) { latestCwd = v } },
              sessRef: { set: function (v) { latestSession = v } },
              notify: function (fn) { notifyDock = fn },
            })
          },
        )
      })
    }

    exports.name = 'image-tiler'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
