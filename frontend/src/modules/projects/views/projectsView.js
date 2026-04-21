// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var ProjectView = require('./projectView');

  var ProjectsView = OriginView.extend({
    className: 'projects',
    supportedLayouts: [
      "grid",
      "list"
    ],

    preRender: function(options) {
      OriginView.prototype.preRender.apply(this, arguments);
      this._isShared = options._isShared;
    },

    postRender: function() {
      this.settings.preferencesKey = 'dashboard';
      this.pageSize = 50;
      this.initUserPreferences();
      this.initEventListeners();
      // Load the first batch quickly, then continue loading in the background.
      this.resetCollection(this.setViewToReady);
    },

    initEventListeners: function() {
      this.listenTo(Origin, {
        'dashboard:refresh': _.debounce(this.resetCollection.bind(this, this.setViewToReady), 250),
        'dashboard:dashboardSidebarView:filterBySearch': function(text) { this.doFilter(text) },
        'dashboard:dashboardSidebarView:filterByTags': function(tags) { this.doFilter(null, tags) },
        'dashboard:sort:asc': function() { this.doSort('asc'); },
        'dashboard:sort:desc': function() { this.doSort('desc'); },
        'dashboard:sort:updated': function() { this.doSort('updated'); }
      });

      this.supportedLayouts.forEach(function(layout) {
        this.listenTo(Origin, 'dashboard:layout:' + layout, function() { this.doLayout(layout); });
      }, this);

      this.listenTo(this.collection, 'add', this.appendProjectItem);
    },

    initUserPreferences: function() {
      var prefs = this.getUserPreferences();

      this.doLayout(prefs.layout);
      this.doSort(prefs.sort, false);
      this.doFilter(prefs.search, prefs.tags, false);
      // set relevant filters as selected
      $("a[data-callback='dashboard:layout:" + prefs.layout + "']").addClass('selected');
      $("a[data-callback='dashboard:sort:" + prefs.sort + "']").addClass('selected');
      // need to refresh this to get latest filters
      prefs = this.getUserPreferences();
      Origin.trigger('options:update:ui', prefs);
      Origin.trigger('sidebar:update:ui', prefs);
    },

    // Set some default preferences
    getUserPreferences: function() {
      var prefs = OriginView.prototype.getUserPreferences.apply(this, arguments);

      if(!prefs.layout) prefs.layout = 'grid';
      if(!prefs.sort) prefs.sort = 'asc';

      return prefs;
    },

    getProjectsContainer: function() {
      return this.$('.projects-list');
    },

    emptyProjectsContainer: function() {
      Origin.trigger('dashboard:dashboardView:removeSubViews');
      this.getProjectsContainer().empty();
    },

    appendProjectItem: function(model) {
      var creator = model.get('createdBy') || { email: Origin.l10n.t('app.unknownuser') };
      var name = creator.firstName ? creator.firstName + ' ' + creator.lastName : creator.email;
      if(this._isShared && name) model.set('creatorName', name);
      this.getProjectsContainer().append(new ProjectView({ model: model }).$el);
    },

    convertFilterTextToPattern: function(filterText) {
      var pattern = '.*' + filterText.toLowerCase() + '.*';
      return { title: pattern };
    },

    resetCollection: function(cb) {
      this.emptyProjectsContainer();
      this.showLoading();
      this.fetchCount = 0;
      this.shouldStopFetches = false;
      this.isCollectionFetching = false;
      this._hasRenderedFirstBatch = false;
      this.collection.reset();
      this.fetchCollection(cb);
    },

    fetchCollection: function(cb) {
      if (this.isCollectionFetching || this.shouldStopFetches) {
        return;
      }
      this.isCollectionFetching = true;
      this.collection.fetch({
        remove: false,
        merge: false,
        data: {
          operators : {
            skip: this.fetchCount,
            limit: this.pageSize,
            sort: this.sort,
            collation: { locale: navigator.language.substring(0, 2) }
          }
        },
        success: function(collection, response) {
          this.isCollectionFetching = false;
          this.fetchCount += response.length;
          if (response.length < this.pageSize) {
            this.shouldStopFetches = true;
          }

          if (!this._hasRenderedFirstBatch) {
            this._hasRenderedFirstBatch = true;
            this.hideLoading();
            // If user has already applied a text or tag filter, reapply it.
            // Otherwise, leave the initially rendered list as-is for faster first paint.
            var hasFilters = (this.filterText && this.filterText.length) || (this.tags && this.tags.length);
            if (hasFilters) {
              this.applyFilters();
            } else {
              this.$('.no-projects').toggleClass('display-none', collection.length > 0);
            }
            if(typeof cb === 'function') cb(collection);
          }

          if (!this.shouldStopFetches) {
            // Yield to browser/UI thread before pulling the next batch.
            return setTimeout(this.fetchCollection.bind(this), 0);
          }

          // Defer tag aggregation so the project list paints first.
          setTimeout(this.updateAvailableTags.bind(this), 0);
        }.bind(this),
        error: function() {
          this.isCollectionFetching = false;
          this.hideLoading();
        }.bind(this)
      });
    },

    updateAvailableTags: function() {
      var tagMap = {};
      var noTagCount = 0;

      this.collection.each(function(model) {
        var tags = model.get('tags') || [];
        if (!tags.length) {
          noTagCount++;
        }
        _.each(tags, function(tag) {
          var id = tag._id || tag.id;
          if (!id) return;
          if (!tagMap[id]) {
            tagMap[id] = {
              id: id,
              title: tag.title || '',
              count: 0
            };
          }
          tagMap[id].count++;
        });
      });

      var tagsArray = _.values(tagMap);

      // Special pseudo-tag for courses with no tags
      tagsArray.push({
        id: '__none__',
        title: Origin.l10n.t('app.notags') || 'No tags',
        count: noTagCount
      });

      Origin.trigger('dashboard:tags:update', tagsArray);
    },

    /**
     * Client-side filtering of projects (DataTables-style global search):
     * - text search matches course title, creator name, and tag titles
     * - tag filter (from sidebar) is applied in the same pass
     */
    applyFilters: function() {
      var text = (this.filterText || '').toLowerCase();
      var selectedIds = this.tags || [];
      var NONE_ID = '__none__';
      var wantNoTags = _.contains(selectedIds, NONE_ID);
      var normalTagIds = _.filter(selectedIds, function(id) { return id !== NONE_ID; });

      var filtered = this.collection.filter(function(model) {
        // Tag filter: union of selected tags and "no tags" pseudo-tag
        if (normalTagIds.length || wantNoTags) {
          var courseTags = model.get('tags') || [];
          var courseTagIds = _.pluck(courseTags, '_id');

          var matchesNormal = normalTagIds.length
            ? _.some(normalTagIds, function(id) {
                return _.contains(courseTagIds, id);
              })
            : false;

          var matchesNoTags = wantNoTags && courseTagIds.length === 0;

          if (!matchesNormal && !matchesNoTags) return false;
        }

        if (!text) return true;

        var title = (model.get('title') || '').toString().toLowerCase();
        var creatorName = (model.get('creatorName') || '').toString().toLowerCase();
        var tags = model.get('tags') || [];
        var tagMatch = _.some(tags, function(tag) {
          return (tag.title || '').toString().toLowerCase().indexOf(text) !== -1;
        });

        return title.indexOf(text) !== -1 ||
               creatorName.indexOf(text) !== -1 ||
               tagMatch;
      });

      this.emptyProjectsContainer();
      _.each(filtered, function(model) {
        this.appendProjectItem(model);
      }, this);

      this.$('.no-projects').toggleClass('display-none', filtered.length > 0);
    },

    showLoading: function() {
      this.$('.projects-loading').removeClass('display-none');
    },

    hideLoading: function() {
      this.$('.projects-loading').addClass('display-none');
    },

    doLayout: function(layout) {
      if(this.supportedLayouts.indexOf(layout) === -1) {
        return;
      }
      this.getProjectsContainer().attr('data-layout', layout);
      this.setUserPreference('layout', layout);
    },

    doSort: function(sort, fetch) {
      switch(sort) {
        case "desc":
          this.sort = { title: -1 };
          break;
        case "updated":
          this.sort = { updatedAt: -1 };
          break;
        case "asc":
        default:
          sort = "asc";
          this.sort = { title: 1 };
      }
      this.setUserPreference('sort', sort);
      if(fetch === false) return;

      // Client-side sort of the already-fetched collection
      switch(sort) {
        case 'updated':
          this.collection.comparator = function(model) {
            // newer first
            return -new Date(model.get('updatedAt')).getTime();
          };
          break;
        case 'desc':
          this.collection.comparator = function(model) {
            return model.get('title') ? model.get('title').toString().toLowerCase() * -1 : '';
          };
          break;
        case 'asc':
        default:
          this.collection.comparator = function(model) {
            return model.get('title') ? model.get('title').toString().toLowerCase() : '';
          };
      }

      this.collection.sort();
      this.applyFilters();
    },

    doFilter: function(text, tags, fetch) {
      text = text || '';
      this.filterText = text;
      this.setUserPreference('search', text, true);

      tags = tags || [];
      this.tags = _.pluck(tags, 'id');
      this.setUserPreference('tags', tags, true);

      if(fetch !== false) this.applyFilters();
    },

    remove: function() {
      OriginView.prototype.remove.apply(this, arguments);
    }

  }, {
    template: 'projects'
  });

  return ProjectsView;
});
