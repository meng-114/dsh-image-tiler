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
  id: '@dsh-external/dsh-image-tiler',
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

    var CSS_TAG = '@dsh-external/dsh-image-tiler/ImageTilerCard.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = '@dsh-external/dsh-image-tiler'
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

    function apply(ctx) {
      var scope = ctx.settingsScope.bind({ namespace: NS })
      ctx.slots.inject('settings.plugin.item', function () {
        return ctx.slots.register(
          { name: 'settings.plugin.item', key: NS },
          function () { return React.createElement(SettingsCard, { scope: scope }) },
        )
      })
    }

    exports.name = 'image-tiler'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
