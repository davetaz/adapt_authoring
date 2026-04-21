// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var Origin = require('core/origin');
  var SidebarItemView = require('modules/sidebar/views/sidebarItemView');
  var Handlebars = require('handlebars');

  var ProjectsSidebarView = SidebarItemView.extend({
    settings: {
      autoRender: true
    },

    events: {
      'click .projects-sidebar-add-course': 'addCourse',
      'click .projects-sidebar-import-course': 'importCourse',
      'click .projects-sidebar-my-courses': 'gotoMyCourses',
      'click .projects-sidebar-shared-courses': 'gotoSharedCourses',
      'click .sidebar-filter-clear': 'clearFilterInput',
      'keyup .projects-sidebar-filter-search-input': 'filterProjectsByTitle',
      'change .projects-sidebar-tag-checkbox': 'onTagCheckboxChanged'
    },

    postRender: function() {
      this.listenTo(Origin, 'dashboard:tags:update', this.onTagsUpdate);
      this.listenTo(Origin, 'sidebar:update:ui', this.updateUI);
      this.tags = [];
      this.availableTags = [];
    },

    highlightSearchBox: function(){
      this.$('.projects-sidebar-filter-search-input').removeClass('search-highlight');
      if (this.$('.projects-sidebar-filter-search-input').val()) {
        this.$('.projects-sidebar-filter-search-input').addClass('search-highlight');
      }
    },

    updateUI: function(userPreferences) {
      if (userPreferences.search) {
        this.$('.projects-sidebar-filter-search-input').val(userPreferences.search);
      }
      this.highlightSearchBox();
      if (userPreferences.tags) {
        this.tags = userPreferences.tags;
        // When tags data arrives from the dashboard, checkboxes will be rendered
        // and selection restored using this.tags
      }
    },

    addCourse: function() {
      Origin.router.navigateTo('project/new');
    },

    importCourse: function() {
      Origin.router.navigateTo('frameworkImport');
    },

    gotoMyCourses: function() {
      Origin.router.navigateTo('dashboard');
    },

    gotoSharedCourses: function() {
      Origin.router.navigateTo('dashboard/shared');
    },

    filterProjectsByTitle: function(event, filter) {
      event && event.preventDefault();

      var filterText = $(event.currentTarget).val().trim();
      Origin.trigger('dashboard:dashboardSidebarView:filterBySearch', filterText);
      this.highlightSearchBox();
    },

    clearFilterInput: function(event) {
      event && event.preventDefault();

      var $currentTarget = $(event.currentTarget);
      $currentTarget.prev('.projects-sidebar-filter-input').val('').trigger('keyup', [true]);
      this.highlightSearchBox();
    },

    onTagsUpdate: function(tags) {
      this.availableTags = tags || [];
      // If no saved selection, default to all tags selected so the view
      // initially shows the full set of courses.
      if (!this.tags || !this.tags.length) {
        this.tags = _.map(this.availableTags, function(tag) {
          return { id: tag.id, title: tag.title };
        });
      }
      this.renderTagCheckboxes();
    },

    renderTagCheckboxes: function() {
      var $list = this.$('.projects-sidebar-tags-list');
      if (!$list.length) return;

      $list.empty();

      var selectedIds = _.pluck(this.tags || [], 'id');

      _.each(this.availableTags, function(tag) {
        var id = tag.id;
        var title = tag.title || '';
        var count = tag.count || 0;
        var isChecked = _.contains(selectedIds, id);
        var escapedTitle = Handlebars.Utils.escapeExpression(title);

        var html = [
          '<div class="sidebar-tag">',
            '<label>',
              '<input type="checkbox" class="projects-sidebar-tag-checkbox" value="', id,
              '" data-title="', escapedTitle, '"', (isChecked ? ' checked="checked"' : ''), ' /> ',
              escapedTitle, ' (', count, ')',
            '</label>',
          '</div>'
        ].join('');

        $list.append(html);
      }, this);
    },

    onTagCheckboxChanged: function(event) {
      event && event.preventDefault();
      this.updateSelectedTagsFromUI();
    },

    updateSelectedTagsFromUI: function() {
      var selected = [];
      this.$('.projects-sidebar-tag-checkbox:checked').each(function(index, el) {
        var $el = $(el);
        selected.push({
          id: $el.val(),
          title: $el.attr('data-title')
        });
      });
      this.tags = selected;
      Origin.trigger('dashboard:dashboardSidebarView:filterByTags', this.tags);
    }
  }, {
    template: 'projectsSidebar'
  });

  return ProjectsSidebarView;
});
