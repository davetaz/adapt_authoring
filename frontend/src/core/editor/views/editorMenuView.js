define(function(require){

  var Origin = require('coreJS/app/origin');
  var OriginView = require('coreJS/app/views/originView');
  var EditorMenuItemView = require('coreJS/editor/views/editorMenuItemView');
  var EditorMenuLayerView = require('coreJS/editor/views/editorMenuLayerView');
  var EditorContentObjectModel = require('coreJS/editor/models/editorContentObjectModel');
  
  var EditorMenuView = OriginView.extend({

    tagName: "div",

    className: "editor-menu",

    events: {
      'click .fake-add-page-button':'addPage'
    },

    preRender: function() {
      this.listenTo(Origin, 'editor:removeSubViews', this.remove);
      this.listenTo(Origin, 'editorMenuItem:showMenuChildren', this.showMenuChildren);
    },

    postRender: function() {
      this.setupMenuViews();
    },

    setupMenuViews: function() {
      this.setupCourseViews();
      var layerOne = this.renderMenuLayerView(this.model.get('_id'), false);
      this.model.getChildren().each(function(contentObject) {
        layerOne.append(new EditorMenuItemView({
          model: contentObject
        }).$el)
      }, this);



      if (Origin.editor.currentMenuState) {
        this.showMenuChildren(this.model);
        _.each(Origin.editor.currentMenuState, function(parentId) {
          this.showMenuChildren(Origin.editor.contentObjects.findWhere({_parentId:parentId}));
        }, this);
        
      }
    },

    setupCourseViews: function() {
      this.renderMenuLayerView(null, true).append(new EditorMenuItemView({model:this.model}).$el);
    },

// renders the views for the current contentObject
    showMenuChildren: function(model) {

      console.log('showMenuChildren', model, Origin.editor.currentMenuState);

      _.each(Origin.editor.currentMenuState, function(parentId) {
        var layer = this.renderMenuLayerView(model.get('_id'), false);
        _.each(Origin.editor.contentObjects.where({_parentId: parentId}), function(contentObject) {
          layer.append(new EditorMenuItemView({
            model: contentObject
          }).$el);
        });

      }, this);
    },

    renderMenuLayerView: function(parentId, isCourseObject) {
      var menuLayerView = new EditorMenuLayerView({_parentId:parentId, _isCourseObject: isCourseObject})
      this.$('.editor-menu-inner').append(menuLayerView.$el);
      return menuLayerView.$('.editor-menu-layer-inner');
    }

  }, {
    template: 'editorMenu'
  });

  return EditorMenuView;

});